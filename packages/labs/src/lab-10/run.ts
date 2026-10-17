import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { sleep, type LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab10Definition } from './definition.js';
import { backoffDelay, classify, retryWithBackoff, type AttemptRecord, type RetryPolicy, type StopReason } from './retry.js';

/** One injected outcome per attempt; the last entry repeats for later attempts. */
interface Fault {
  status?: number;
  retryAfterMs?: number;
  slow?: boolean;
}
const OK: Fault = {};

export const SCENARIOS = {
  none: [OK],
  'transient-then-success': [{ status: 503 }, { status: 429 }, OK],
  'always-unavailable': [{ status: 503 }],
  'bad-request': [{ status: 400 }],
  'slow-then-success': [{ slow: true }, OK],
  'rate-limited-retry-after': [{ status: 429, retryAfterMs: 600 }, OK],
} satisfies Record<string, Fault[]>;
export type Scenario = keyof typeof SCENARIOS;

export function faultFor(scenario: Scenario, attempt: number): Fault {
  const list: Fault[] = SCENARIOS[scenario];
  return list[Math.min(attempt - 1, list.length - 1)]!;
}

export const Lab10InputSchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
  scenario: z.enum(Object.keys(SCENARIOS) as [Scenario, ...Scenario[]]),
  maxAttempts: z.number().int().min(1).max(6),
  baseDelayMs: z.number().int().min(10).max(2000),
  perAttemptTimeoutMs: z.number().int().min(200).max(10_000),
  totalBudgetMs: z.number().int().min(500).max(30_000),
  idempotent: z.boolean(),
});
export type Lab10Input = z.infer<typeof Lab10InputSchema>;

export interface Lab10Output {
  outcome: 'succeeded' | 'failed';
  stopReason: StopReason;
  attempts: AttemptRecord[];
  retries: number;
  totalMs: number;
  text: string | null;
  policy: RetryPolicy;
}

const MAX_DELAY_MS = 4000;

export const lab10: LabImplementation<Lab10Input, Lab10Output, LabServices> = {
  definition: lab10Definition as LabDefinition,
  inputSchema: Lab10InputSchema,

  async run(ctx, input) {
    const scenario: Scenario = ctx.mode === 'offline' ? input.scenario : 'none';
    if (ctx.mode === 'live' && input.scenario !== 'none')
      ctx.log('warn', 'Fault injection is offline-only; the live call runs through the same retry policy.');
    const policy: RetryPolicy = {
      maxAttempts: input.maxAttempts,
      baseDelayMs: input.baseDelayMs,
      maxDelayMs: MAX_DELAY_MS,
      perAttemptTimeoutMs: input.perAttemptTimeoutMs,
      totalBudgetMs: input.totalBudgetMs,
      idempotent: input.idempotent,
    };

    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: (view): ScriptedTurn => {
        const f = faultFor(scenario, view.callIndex + 1);
        if (f.slow) return { delayMs: input.perAttemptTimeoutMs + 2000, text: 'too late' };
        if (f.status) {
          const err = Object.assign(new Error(`HTTP ${f.status} (offline fault injection)`), {
            statusCode: f.status,
            ...(f.retryAfterMs ? { retryAfterMs: f.retryAfterMs } : {}),
          });
          return { error: err };
        }
        return { text: simulatedAnswer({ modelId: input.modelId, system: view.system, user: view.lastUser }) };
      },
    });
    // maxRetries: 0 — this lab's policy owns retries, so Mastra's own retry loop must not hide attempts.
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'retry-agent',
        name: 'Retry Agent',
        instructions: 'Answer briefly.',
        model: resolved.model,
        maxRetries: 0,
      }),
    );

    const result = await retryWithBackoff(
      async (attemptSignal, n) => {
        ctx.emit({ type: 'workflow-step', stepId: `attempt-${n}`, status: 'running' });
        const res = await agent.generate(input.prompt, { abortSignal: attemptSignal });
        // Mastra resolves (with empty text) instead of rejecting when its signal aborts,
        // so an attempt that hit its timeout must be turned into a failure explicitly.
        if (attemptSignal.aborted) throw new Error('attempt aborted');
        return res.text;
      },
      policy,
      ctx.signal,
      {
        now: Date.now,
        sleep: (ms, signal) => sleep(ms, signal),
        onAttempt: (r) => {
          ctx.emit({
            type: 'workflow-step',
            stepId: `attempt-${r.attempt}`,
            status: r.outcome === 'success' ? 'success' : 'failed',
            durationMs: r.durationMs,
            output:
              r.outcome === 'success'
                ? { ok: true }
                : { statusCode: r.statusCode ?? null, timedOut: r.timedOut ?? false, classification: r.classification },
          });
          if (r.outcome === 'failure') {
            const what = r.timedOut ? `timed out after ${input.perAttemptTimeoutMs} ms` : `HTTP ${r.statusCode}`;
            ctx.log('warn', `Attempt ${r.attempt} failed: ${what} → ${r.classification}`);
          }
        },
        onWait: (ms, next) => {
          ctx.log('info', `Backing off ${ms} ms before attempt ${next}`);
          ctx.emit({ type: 'log', level: 'info', message: `wait ${ms} ms`, annotations: { backoffMs: ms, nextAttempt: next } });
        },
      },
    );

    const outcome = result.stopReason === 'success' ? 'succeeded' : 'failed';
    ctx.log(
      outcome === 'succeeded' ? 'info' : 'warn',
      `Stopped: ${result.stopReason} after ${result.attempts.length} attempt(s) in ${result.totalMs} ms`,
    );
    ctx.setResultExtras({
      effective: { ...policy, scenario, mode: ctx.mode, simulated: resolved.simulated },
      annotations: { attempts: result.attempts.length, stopReason: result.stopReason },
    });
    return {
      outcome,
      stopReason: result.stopReason,
      attempts: result.attempts,
      retries: Math.max(0, result.attempts.length - 1),
      totalMs: result.totalMs,
      text: result.value ?? null,
      policy,
    };
  },

  validate(out, input, { mode }) {
    const scenario: Scenario = mode === 'offline' ? input.scenario : 'none';
    const failures = out.attempts.filter((a) => a.outcome === 'failure');
    // Offline: compare with the injected fault. Live: compare with what actually happened.
    const classificationOk = failures.every((a) => {
      if (mode === 'live') return a.classification === classify({ statusCode: a.statusCode, timedOut: a.timedOut });
      const f = faultFor(scenario, a.attempt);
      return a.classification === classify({ statusCode: f.status, timedOut: Boolean(f.slow) });
    });
    const firstNonRetryable = out.attempts.findIndex((a) => a.classification === 'non-retryable');
    const backoffOk = out.attempts.every(
      (a) => a.waitMs === 0 || a.waitMs === backoffDelay(a.attempt, out.policy, faultFor(scenario, a.attempt).retryAfterMs),
    );
    return summarizeChecks([
      {
        id: 'classified',
        label: 'Each failure was classified as retryable or non-retryable correctly',
        passed: classificationOk,
      },
      {
        id: 'no-retry-non-retryable',
        label: 'Non-retryable errors were not retried',
        passed: firstNonRetryable === -1 || firstNonRetryable === out.attempts.length - 1,
      },
      {
        id: 'bounded',
        label: 'Attempts and time stayed within the limits',
        passed: out.attempts.length <= out.policy.maxAttempts && out.totalMs <= out.policy.totalBudgetMs,
        message: `${out.attempts.length}/${out.policy.maxAttempts} attempts · ${out.totalMs}/${out.policy.totalBudgetMs} ms`,
      },
      {
        id: 'backoff',
        label: 'Waits doubled each time (or honoured Retry-After)',
        passed: backoffOk,
        message:
          out.attempts
            .filter((a) => a.waitMs > 0)
            .map((a) => `${a.waitMs} ms`)
            .join(' → ') || 'no waits',
      },
      {
        id: 'idempotency',
        label: 'Non-idempotent work was never retried',
        passed: input.idempotent || out.attempts.length === 1,
      },
    ]);
  },
};
