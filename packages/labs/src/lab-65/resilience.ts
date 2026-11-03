/**
 * App-level resilience boundaries (not a Mastra API): per-attempt timeouts that abort the attempt,
 * bounded retries for retryable failures only, and a circuit breaker per dependency.
 */

export type BreakerState = 'closed' | 'open' | 'half-open';
export interface Transition {
  from: BreakerState;
  to: BreakerState;
  atMs: number;
  reason: string;
}

/**
 * closed → open after `failureThreshold` consecutive failures; open → half-open once `coolDownMs` passed
 * (one probe at a time); half-open → closed on success, back to open on failure.
 */
export class CircuitBreaker {
  state: BreakerState = 'closed';
  readonly transitions: Transition[] = [];
  shortCircuited = 0;
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  private readonly started: number;

  constructor(
    readonly name: string,
    private readonly opts: { failureThreshold: number; coolDownMs: number; now?: () => number },
  ) {
    this.started = this.now();
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }
  private move(to: BreakerState, reason: string) {
    if (to === this.state) return;
    this.transitions.push({ from: this.state, to, atMs: this.now() - this.started, reason });
    this.state = to;
  }

  /** May a call go out now? Counts calls refused while open. */
  allow(): boolean {
    if (this.state === 'open' && this.now() - this.openedAt >= this.opts.coolDownMs) this.move('half-open', 'cool-down elapsed');
    if (this.state === 'closed') return true;
    if (this.state === 'half-open' && !this.probing) {
      this.probing = true;
      return true;
    }
    this.shortCircuited += 1;
    return false;
  }

  success() {
    this.failures = 0;
    this.probing = false;
    this.move('closed', this.state === 'half-open' ? 'probe succeeded' : 'success');
  }

  failure(reason: string) {
    this.failures += 1;
    if (this.state === 'half-open') {
      this.probing = false;
      this.openedAt = this.now();
      this.move('open', `probe failed: ${reason}`);
    } else if (this.state === 'closed' && this.failures >= this.opts.failureThreshold) {
      this.openedAt = this.now();
      this.move('open', `${this.failures} consecutive failures (${reason})`);
    }
  }
}

export type Outcome = 'ok' | 'failed' | 'timeout' | 'short-circuit' | 'cancelled';

export class AttemptTimeout extends Error {
  readonly timeout = true;
  constructor(ms: number) {
    super(`attempt timed out after ${ms} ms`);
  }
}

/** HTTP status of a provider-style error, if any. */
export const statusOf = (err: unknown): number | undefined => {
  const s = (err as { statusCode?: unknown } | undefined)?.statusCode;
  return typeof s === 'number' ? s : undefined;
};

/** Retry only what may succeed a moment later: timeouts, 408, 429 and 5xx. Never 400 or 401. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AttemptTimeout) return true;
  const s = statusOf(err);
  return s === 408 || s === 429 || (s !== undefined && s >= 500);
}

export const backoffMs = (retry: number, baseDelayMs: number, maxDelayMs = 2_000) =>
  Math.min(maxDelayMs, baseDelayMs * 2 ** (retry - 1));

/** Waits ms, or rejects at once when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface AttemptRecord {
  dep: string;
  attempt: number;
  outcome: Exclude<Outcome, 'short-circuit'> | 'short-circuit';
  durationMs: number;
  timeoutMs: number;
  error?: string;
}

export interface CallResult<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
  outcome: Outcome;
  attempts: number;
}

export interface CallOptions {
  attempts: number;
  timeoutMs: number;
  baseDelayMs: number;
  breaker: CircuitBreaker;
  signal?: AbortSignal;
  onAttempt?: (r: AttemptRecord) => void;
  onStart?: (attempt: number) => void;
}

/**
 * Runs `fn` with a per-attempt timeout (the attempt's signal is aborted on timeout), retries retryable
 * failures with exponential backoff up to `attempts`, consults the breaker before every attempt and stops
 * at once when the caller's signal aborts.
 */
export async function resilientCall<T>(
  dep: string,
  fn: (signal: AbortSignal) => Promise<T>,
  o: CallOptions,
): Promise<CallResult<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    if (o.signal?.aborted) return { ok: false, outcome: 'cancelled', attempts: attempt - 1, error: o.signal.reason };
    if (!o.breaker.allow()) {
      o.onAttempt?.({ dep, attempt, outcome: 'short-circuit', durationMs: 0, timeoutMs: o.timeoutMs });
      return { ok: false, outcome: 'short-circuit', attempts: attempt - 1, error: lastError };
    }
    o.onStart?.(attempt);
    const ctrl = new AbortController();
    const onOuter = () => ctrl.abort(o.signal!.reason);
    o.signal?.addEventListener('abort', onOuter, { once: true });
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const value = await Promise.race([
        fn(ctrl.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const err = new AttemptTimeout(o.timeoutMs);
            ctrl.abort(err);
            reject(err);
          }, o.timeoutMs);
        }),
        new Promise<never>((_, reject) => {
          if (o.signal) o.signal.addEventListener('abort', () => reject(o.signal!.reason), { once: true });
        }),
      ]);
      o.breaker.success();
      o.onAttempt?.({ dep, attempt, outcome: 'ok', durationMs: Date.now() - started, timeoutMs: o.timeoutMs });
      return { ok: true, value, outcome: 'ok', attempts: attempt };
    } catch (err) {
      const durationMs = Date.now() - started;
      if (o.signal?.aborted) {
        o.onAttempt?.({ dep, attempt, outcome: 'cancelled', durationMs, timeoutMs: o.timeoutMs });
        return { ok: false, outcome: 'cancelled', attempts: attempt, error: err };
      }
      lastError = err;
      const timedOut = err instanceof AttemptTimeout;
      o.breaker.failure(timedOut ? 'timeout' : `HTTP ${statusOf(err) ?? '?'}`);
      o.onAttempt?.({
        dep,
        attempt,
        outcome: timedOut ? 'timeout' : 'failed',
        durationMs,
        timeoutMs: o.timeoutMs,
        error: timedOut ? 'timeout' : `HTTP ${statusOf(err) ?? 'error'}`,
      });
      if (!isRetryable(err) || attempt === o.attempts)
        return { ok: false, outcome: timedOut ? 'timeout' : 'failed', attempts: attempt, error: err };
      try {
        await sleep(backoffMs(attempt, o.baseDelayMs), o.signal);
      } catch {
        return { ok: false, outcome: 'cancelled', attempts: attempt, error: o.signal?.reason };
      }
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onOuter);
    }
  }
  return { ok: false, outcome: 'failed', attempts: o.attempts, error: lastError };
}
