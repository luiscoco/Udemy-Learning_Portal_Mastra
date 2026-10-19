import type { ZodType } from 'zod';
import { sleep } from '@mlp/lab-engine';
import type { Result } from './schemas.js';

/** One attempt of an agent step, as the lab recorded it (Mastra streams one start/result for the whole series). */
export interface AttemptRecord {
  stepId: string;
  attempt: number;
  ok: boolean;
  code: string | null;
  message: string | null;
  backoffMs: number;
  durationMs: number;
  simulated: boolean;
}

/** A failure with a stable code. `simulated` marks an injected fault. */
export class StepError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly simulated = false,
  ) {
    super(message);
  }
}

export const backoffMs = (retryCount: number) => (retryCount === 0 ? 0 : 100 * 2 ** (retryCount - 1));

const codeOf = (e: unknown): string => {
  if (e instanceof StepError) return e.code;
  const id = (e as { id?: unknown })?.id;
  if (typeof id === 'string' && id) return id; // MastraError ids, e.g. STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED
  return 'AGENT_ERROR';
};

/**
 * The error boundary of one agent step. It waits with exponential backoff before a retry, runs the attempt,
 * validates the value with the step's schema and records the attempt. While retries remain it rethrows,
 * so Mastra's `retries` runs the step again; on the last attempt it returns a typed failure instead, so
 * the workflow keeps going. An aborted run is always rethrown.
 */
export async function runBoundary<T>(o: {
  stepId: string;
  retryCount: number;
  maxRetries: number;
  schema: ZodType<T>;
  signal: AbortSignal;
  record: (a: AttemptRecord) => void;
  /** True when this attempt carries an injected fault (for example output corrupted in transit). */
  injected?: boolean;
  attempt: () => Promise<unknown>;
}): Promise<Result<T>> {
  const wait = backoffMs(o.retryCount);
  if (wait) await sleep(wait, o.signal);
  const t0 = performance.now();
  try {
    const parsed = o.schema.safeParse(await o.attempt());
    if (!parsed.success)
      throw new StepError(
        'OUTPUT_SCHEMA_INVALID',
        parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      );
    o.record({
      stepId: o.stepId,
      attempt: o.retryCount + 1,
      ok: true,
      code: null,
      message: null,
      backoffMs: wait,
      durationMs: Math.round(performance.now() - t0),
      simulated: false,
    });
    return { ok: true, value: parsed.data, attempts: o.retryCount + 1 };
  } catch (e) {
    if (o.signal.aborted) throw e;
    const code = codeOf(e);
    const message = e instanceof Error ? e.message.slice(0, 300) : String(e);
    o.record({
      stepId: o.stepId,
      attempt: o.retryCount + 1,
      ok: false,
      code,
      message,
      backoffMs: wait,
      durationMs: Math.round(performance.now() - t0),
      simulated: !!o.injected || (e instanceof StepError && e.simulated),
    });
    if (o.retryCount < o.maxRetries) throw e;
    return { ok: false, error: { code, message }, attempts: o.retryCount + 1 };
  }
}
