export const WORKERS = ['researcher', 'planner', 'analyst'] as const;
export type Worker = (typeof WORKERS)[number];

export interface Limits {
  maxDelegations: number;
  perWorkerLimit: number;
  tokenBudget: number;
}
export type RefusalReason = 'total-cap' | 'per-worker-cap' | 'duplicate' | 'token-budget' | 'unknown-worker';

export interface BudgetSnapshot {
  delegations: number;
  perWorker: Record<Worker, number>;
  tokens: number;
}

/** The supervisor's spending so far. Slots are reserved when a delegation starts, not when it finishes. */
export class Ledger {
  accepted = 0;
  perWorker: Record<Worker, number> = { researcher: 0, planner: 0, analyst: 0 };
  spentTokens = 0;
  readonly seen = new Set<string>();

  snapshot(): BudgetSnapshot {
    return { delegations: this.accepted, perWorker: { ...this.perWorker }, tokens: this.spentTokens };
  }
  spend(tokens: number) {
    this.spentTokens += Math.max(0, tokens);
  }
}

/** Lower-case, punctuation and whitespace collapsed: "Research X!" and "research  x" are the same task. */
export const normalisePrompt = (p: string) =>
  p
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isWorker = (id: string): id is Worker => (WORKERS as readonly string[]).includes(id);

export type Decision = { accepted: true } | { accepted: false; reason: RefusalReason; detail: string };

/**
 * Decides one delegation. Checks run in this order: duplicate (a cycle; most specific, so a verbatim
 * re-send is reported as a cycle even when a cap would also refuse it), total cap, per-worker cap,
 * token budget. An accepted delegation reserves its slot immediately, because Mastra starts several
 * delegations of one step before any of them completes.
 */
export function decideDelegation(ledger: Ledger, limits: Limits, worker: string, prompt: string): Decision {
  if (!isWorker(worker)) return { accepted: false, reason: 'unknown-worker', detail: `no worker named ${worker}` };
  const key = `${worker}|${normalisePrompt(prompt)}`;
  if (ledger.seen.has(key)) return { accepted: false, reason: 'duplicate', detail: `${worker} already received this task` };
  if (ledger.accepted >= limits.maxDelegations)
    return { accepted: false, reason: 'total-cap', detail: `${ledger.accepted}/${limits.maxDelegations} delegations used` };
  if (ledger.perWorker[worker] >= limits.perWorkerLimit)
    return {
      accepted: false,
      reason: 'per-worker-cap',
      detail: `${worker} already ran ${ledger.perWorker[worker]}/${limits.perWorkerLimit} time(s)`,
    };
  if (ledger.spentTokens >= limits.tokenBudget)
    return { accepted: false, reason: 'token-budget', detail: `${ledger.spentTokens}/${limits.tokenBudget} tokens spent` };
  ledger.accepted++;
  ledger.perWorker[worker]++;
  ledger.seen.add(key);
  return { accepted: true };
}

/** What the supervisor model is told after each worker result. */
export const budgetLine = (ledger: Ledger, limits: Limits) =>
  `[Budget left: ${limits.maxDelegations - ledger.accepted} delegation(s), ${Math.max(0, limits.tokenBudget - ledger.spentTokens)} tokens]`;
