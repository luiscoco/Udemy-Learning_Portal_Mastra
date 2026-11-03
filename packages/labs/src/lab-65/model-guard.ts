import type { CircuitBreaker, AttemptRecord } from './resilience.js';
import { resilientCall, sleep, statusOf } from './resilience.js';

export const MODEL_FAULTS = ['none', 'outage', 'rate-limit', 'slow', 'bad-key'] as const;
export type ModelFault = (typeof MODEL_FAULTS)[number];

const httpError = (statusCode: number) =>
  Object.assign(new Error(`HTTP ${statusCode} (fault injection)`), {
    name: 'AI_APICallError',
    statusCode,
    isRetryable: statusCode >= 500 || statusCode === 429,
  });

/** Throws or hangs as the fault says, before the real provider is called, so an injected outage costs nothing. */
export async function injectModelFault(fault: ModelFault, signal: AbortSignal): Promise<void> {
  if (fault === 'outage') throw httpError(503);
  if (fault === 'rate-limit') throw httpError(429);
  if (fault === 'bad-key') throw httpError(401);
  if (fault === 'slow') await sleep(10 * 60_000, signal); // hangs until the attempt timeout aborts it
}

/** Minimal shape of an AI SDK v2 language model, as Mastra accepts in its fallback array. */
interface ModelLike {
  readonly specificationVersion: 'v2';
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls?: unknown;
  doGenerate(options: { abortSignal?: AbortSignal } & Record<string, unknown>): PromiseLike<unknown>;
  doStream(options: { abortSignal?: AbortSignal } & Record<string, unknown>): PromiseLike<unknown>;
}

export interface GuardOptions {
  dep: string;
  fault: ModelFault;
  attempts: number;
  timeoutMs: number;
  baseDelayMs: number;
  breaker: CircuitBreaker;
  onAttempt: (r: AttemptRecord) => void;
  onStart?: (attempt: number) => void;
}

/**
 * Wraps a model so that this code, not the framework, owns attempts and per-attempt timeouts
 * (the timeout covers the time until the provider starts answering). On final failure it throws a
 * non-retryable error, so a Mastra fallback entry with maxRetries: 0 moves to the next model at once:
 * with Mastra 1.78.0 a retryable error is otherwise retried about 3 times per entry attempt.
 */
export function guardModel<M extends ModelLike>(inner: M, o: GuardOptions): M {
  const run = async (method: 'doGenerate' | 'doStream', options: { abortSignal?: AbortSignal } & Record<string, unknown>) => {
    const result = await resilientCall(
      o.dep,
      async (signal) => {
        await injectModelFault(o.fault, signal);
        return inner[method]({ ...options, abortSignal: signal });
      },
      {
        attempts: o.attempts,
        timeoutMs: o.timeoutMs,
        baseDelayMs: o.baseDelayMs,
        breaker: o.breaker,
        signal: options.abortSignal,
        onAttempt: o.onAttempt,
        onStart: o.onStart,
      },
    );
    if (result.ok) return result.value;
    if (result.outcome === 'cancelled') throw options.abortSignal?.reason ?? new Error('cancelled');
    throw Object.assign(new Error(`${o.dep} unavailable: ${result.outcome}`), {
      isRetryable: false,
      statusCode: statusOf(result.error),
      outcome: result.outcome,
    });
  };
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'doGenerate') return (opts: Record<string, unknown>) => run('doGenerate', opts);
      if (prop === 'doStream') return (opts: Record<string, unknown>) => run('doStream', opts);
      // Read from (and bind to) the real model: classes such as ModelRouterLanguageModel use #private fields.
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
