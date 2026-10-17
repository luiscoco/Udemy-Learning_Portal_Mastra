import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { LibSQLStore } from '@mastra/libsql';

export const WORKFLOW_ID = 'refund-approval';
export const GATE_STEP = 'supervisorApproval';
export const SETTLE_RETRIES = 2;

export const RefundRequestSchema = z.object({
  refundId: z.string().regex(/^R-\d{1,6}$/),
  orderId: z.string().regex(/^O-\d{1,6}$/),
  customer: z.string().trim().min(1).max(80),
  amount: z.number().min(0.01).max(5_000),
  reason: z.string().trim().min(1).max(300),
});
export type RefundRequest = z.infer<typeof RefundRequestSchema>;

export const WorkflowInputSchema = z.object({ request: RefundRequestSchema, ttlMinutes: z.number().int().min(1).max(1_440) });

export const SummarySchema = z.object({ recommendation: z.enum(['approve', 'reject']), summary: z.string() });
export type Summary = z.infer<typeof SummarySchema>;

export const GateSuspendSchema = z.object({
  refundId: z.string(),
  amount: z.number(),
  summary: z.string(),
  recommendation: z.enum(['approve', 'reject']),
  expiresAt: z.string(),
});
export type GatePayload = z.infer<typeof GateSuspendSchema>;
export const DecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'expire']),
  supervisor: z.string().trim().min(1).max(60),
  note: z.string().max(200).optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const OutcomeSchema = z.object({
  refundId: z.string(),
  status: z.enum(['refunded', 'rejected', 'expired']),
  decidedBy: z.string(),
  paymentId: z.string().nullable(),
  /** Attempts the payment step needed (1 + Mastra retries). 0 when nothing was paid. */
  attempts: z.number().int(),
  replayed: z.boolean(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

// ---------- Simulated payment provider (app-level, durable ledger) ----------

export interface Payment {
  lineage: string;
  refundId: string;
  paymentId: string;
  idempotencyKey: string | null;
  amount: number;
  pid: number;
  at: string;
}

export class PaymentProvider {
  /** Remaining lost acknowledgements per workflow run (in memory: a transient network fault). */
  private readonly lostAcks = new Map<string, number>();
  calls = 0;
  constructor(readonly file: string) {}

  loseAcknowledgements(lineage: string, n: number) {
    this.lostAcks.set(lineage, n);
  }

  /** Records the refund, then may "lose" the acknowledgement. A known key replays the earlier payment. */
  refund(o: { key: string | null; lineage: string; refundId: string; amount: number }): { paymentId: string; replayed: boolean } {
    this.calls++;
    const existing = o.key ? this.read(o.lineage).find((p) => p.idempotencyKey === o.key) : undefined;
    const result = existing
      ? { paymentId: existing.paymentId, replayed: true }
      : { paymentId: `PAY-${randomUUID().slice(0, 8)}`, replayed: false };
    if (!existing) {
      mkdirSync(dirname(this.file), { recursive: true });
      const p: Payment = { ...o, idempotencyKey: o.key, paymentId: result.paymentId, pid: process.pid, at: new Date().toISOString() };
      appendFileSync(this.file, `${JSON.stringify(p)}\n`);
    }
    const lost = this.lostAcks.get(o.lineage) ?? 0;
    if (lost > 0) {
      this.lostAcks.set(o.lineage, lost - 1);
      throw new Error('connection reset before acknowledgement');
    }
    return result;
  }

  read(lineage?: string): Payment[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Payment)
      .filter((p) => lineage === undefined || p.lineage === lineage);
  }
}

export type Summarizer = (r: RefundRequest) => Promise<Summary>;

export interface RefundDeps {
  summarize: Summarizer;
  provider: PaymentProvider;
  idempotency: 'key' | 'none';
  /** Injected clock: the demo advances it to show expiry without waiting. */
  now: () => number;
}

/** Pure expiry rule, evaluated inside the workflow on every resume. */
export function resolveDecision(d: Decision, expiresAt: string, now: number): { status: 'approved' | 'rejected' | 'expired'; by: string } {
  if (d.decision === 'expire') return { status: 'expired', by: `${d.supervisor} (expiry sweep)` };
  if (now > Date.parse(expiresAt)) return { status: 'expired', by: `${d.supervisor} (too late: the approval window had closed)` };
  return { status: d.decision === 'approve' ? 'approved' : 'rejected', by: d.supervisor };
}

/** Builds a fresh workflow and Mastra instance on the storage (nothing shared between calls). */
export function openRefunds(storage: LibSQLStore, deps: RefundDeps) {
  const Prepared = z.object({ request: RefundRequestSchema, ttlMinutes: z.number(), summary: SummarySchema });
  const Gated = z.object({ request: RefundRequestSchema, status: z.enum(['approved', 'rejected', 'expired']), by: z.string() });

  const prepareRefund = createStep({
    id: 'prepareRefund',
    description: 'An agent summarises the request and recommends a decision (no money moves).',
    inputSchema: WorkflowInputSchema,
    outputSchema: Prepared,
    execute: async ({ inputData }) => ({ ...inputData, summary: await deps.summarize(inputData.request) }),
  });
  const supervisorApproval = createStep({
    id: GATE_STEP,
    description: 'Gate: suspends until a supervisor approves or rejects, or the request expires.',
    inputSchema: Prepared,
    outputSchema: Gated,
    suspendSchema: GateSuspendSchema,
    resumeSchema: DecisionSchema,
    execute: async ({ inputData, resumeData, suspendData, suspend }) => {
      if (!resumeData) {
        return await suspend({
          refundId: inputData.request.refundId,
          amount: inputData.request.amount,
          summary: inputData.summary.summary,
          recommendation: inputData.summary.recommendation,
          expiresAt: new Date(deps.now() + inputData.ttlMinutes * 60_000).toISOString(),
        });
      }
      const { status, by } = resolveDecision(resumeData, suspendData!.expiresAt, deps.now());
      return { request: inputData.request, status, by };
    },
  });
  const settle = createStep({
    id: 'settle',
    description: 'Pays only when approved; retried by Mastra on transient provider errors.',
    inputSchema: Gated,
    outputSchema: OutcomeSchema,
    retries: SETTLE_RETRIES,
    execute: async ({ inputData, runId, retryCount }) => {
      const base = { refundId: inputData.request.refundId, decidedBy: inputData.by };
      if (inputData.status !== 'approved') return { ...base, status: inputData.status, paymentId: null, attempts: 0, replayed: false };
      const paid = deps.provider.refund({
        key: deps.idempotency === 'key' ? `refund:${runId}` : null,
        lineage: runId,
        refundId: inputData.request.refundId,
        amount: inputData.request.amount,
      });
      return { ...base, status: 'refunded' as const, paymentId: paid.paymentId, attempts: (retryCount ?? 0) + 1, replayed: paid.replayed };
    },
  });
  const workflow = createWorkflow({ id: WORKFLOW_ID, inputSchema: WorkflowInputSchema, outputSchema: OutcomeSchema })
    .then(prepareRefund)
    .then(supervisorApproval)
    .then(settle)
    .commit();
  const mastra = new Mastra({ workflows: { [WORKFLOW_ID]: workflow }, storage, logger: false });
  return { mastra, workflow: mastra.getWorkflow(WORKFLOW_ID) };
}
