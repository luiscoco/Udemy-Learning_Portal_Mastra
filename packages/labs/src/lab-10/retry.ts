/**
 * App-level retry policy (not a Mastra API): classify failures, back off exponentially, and stop
 * at max attempts, a total time budget or the first non-retryable error. Only idempotent work may
 * be retried. Mastra itself offers `maxRetries` on agents and model fallback arrays; this module
 * makes every decision visible so learners can reason about it.
 */

export type Classification = 'retryable' | 'non-retryable';

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface FailureInfo {
  statusCode?: number;
  timedOut?: boolean;
  retryAfterMs?: number;
}

export function classify(f: FailureInfo): Classification {
  if (f.timedOut) return 'retryable';
  if (f.statusCode === undefined) return 'non-retryable'; // unknown errors are not retried blindly
  return RETRYABLE_STATUS.has(f.statusCode) ? 'retryable' : 'non-retryable';
}

/** Delay before attempt n+1 (n = 1-based number of the attempt that just failed). Retry-After wins if larger. */
export function backoffDelay(n: number, opts: { baseDelayMs: number; maxDelayMs: number }, retryAfterMs?: number): number {
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (n - 1));
  return Math.max(exp, retryAfterMs ?? 0);
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  perAttemptTimeoutMs: number;
  totalBudgetMs: number;
  idempotent: boolean;
}

export type StopReason = 'success' | 'non-retryable' | 'max-attempts' | 'budget' | 'not-idempotent';

export interface AttemptRecord {
  attempt: number;
  outcome: 'success' | 'failure';
  statusCode?: number;
  timedOut?: boolean;
  classification?: Classification;
  durationMs: number;
  /** Wait before the next attempt (0 when no retry follows). */
  waitMs: number;
}

export interface RetryResult<T> {
  value?: T;
  attempts: AttemptRecord[];
  stopReason: StopReason;
  totalMs: number;
}

export interface RetryHooks {
  now: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  onAttempt?: (r: AttemptRecord) => void;
  onWait?: (ms: number, nextAttempt: number) => void;
}

/** Extracts failure info from a thrown value (statusCode / Retry-After as set by providers or fault injection). */
export function failureInfo(err: unknown, timedOut: boolean): FailureInfo {
  const e = err as { statusCode?: number; status?: number; retryAfterMs?: number; responseHeaders?: Record<string, string> };
  const header = e?.responseHeaders?.['retry-after'];
  const retryAfterMs = e?.retryAfterMs ?? (header && /^\d+$/.test(header) ? Number(header) * 1000 : undefined);
  return { statusCode: e?.statusCode ?? e?.status, timedOut, retryAfterMs };
}

/**
 * Runs `fn` with the policy. `fn` receives a per-attempt AbortSignal (combined with `signal`) that fires
 * at the per-attempt timeout. Cancellation of `signal` is rethrown immediately (never retried).
 */
export async function retryWithBackoff<T>(
  fn: (attemptSignal: AbortSignal, attempt: number) => Promise<T>,
  policy: RetryPolicy,
  signal: AbortSignal,
  hooks: RetryHooks,
): Promise<RetryResult<T>> {
  const started = hooks.now();
  const attempts: AttemptRecord[] = [];
  const maxAttempts = policy.idempotent ? policy.maxAttempts : 1;

  for (let n = 1; ; n++) {
    signal.throwIfAborted();
    const attemptCtrl = new AbortController();
    const timer = setTimeout(() => attemptCtrl.abort(new Error('attempt timeout')), policy.perAttemptTimeoutMs);
    const attemptSignal = AbortSignal.any([signal, attemptCtrl.signal]);
    const t0 = hooks.now();
    try {
      const value = await fn(attemptSignal, n);
      const rec: AttemptRecord = { attempt: n, outcome: 'success', durationMs: hooks.now() - t0, waitMs: 0 };
      attempts.push(rec);
      hooks.onAttempt?.(rec);
      return { value, attempts, stopReason: 'success', totalMs: hooks.now() - started };
    } catch (err) {
      signal.throwIfAborted(); // user cancel / run deadline: stop, do not retry
      const info = failureInfo(err, attemptCtrl.signal.aborted);
      const classification = classify(info);
      const rec: AttemptRecord = {
        attempt: n,
        outcome: 'failure',
        ...(info.statusCode !== undefined ? { statusCode: info.statusCode } : {}),
        ...(info.timedOut ? { timedOut: true } : {}),
        classification,
        durationMs: hooks.now() - t0,
        waitMs: 0,
      };
      attempts.push(rec);

      let stop: StopReason | null = null;
      if (!policy.idempotent && classification === 'retryable') stop = 'not-idempotent';
      else if (classification === 'non-retryable') stop = 'non-retryable';
      else if (n >= maxAttempts) stop = 'max-attempts';
      const wait = stop ? 0 : backoffDelay(n, policy, info.retryAfterMs);
      const elapsed = hooks.now() - started;
      if (!stop && elapsed + wait + policy.perAttemptTimeoutMs > policy.totalBudgetMs) stop = 'budget';

      if (stop) {
        hooks.onAttempt?.(rec);
        return { attempts, stopReason: stop, totalMs: hooks.now() - started };
      }
      rec.waitMs = wait;
      hooks.onAttempt?.(rec);
      hooks.onWait?.(wait, n + 1);
      await hooks.sleep(wait, signal);
    } finally {
      clearTimeout(timer);
    }
  }
}
