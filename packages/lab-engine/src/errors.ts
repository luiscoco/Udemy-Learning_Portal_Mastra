import { ZodError } from 'zod';
import { redactSecrets, type ApiErrorCode } from '@mlp/contracts';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** The only way lab code should signal a typed, user-presentable failure. */
export class LabError extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly details?: ErrorDetail[];

  constructor(code: ApiErrorCode, message: string, opts: { retryable?: boolean; details?: ErrorDetail[]; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'LabError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
  }
}

export type AbortKind = 'cancelled' | 'timeout' | 'disconnected';

/** Value used as AbortController reason so the engine can tell why a run stopped. */
export class RunAbortedError extends Error {
  constructor(public readonly kind: AbortKind) {
    super(
      kind === 'timeout'
        ? 'Run exceeded its deadline'
        : kind === 'disconnected'
          ? 'Run cancelled because the client disconnected'
          : 'Run cancelled by request',
    );
    this.name = 'RunAbortedError';
  }
}

export function zodDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message }));
}

export interface CanonicalError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  details?: ErrorDetail[];
}

/** Maps any thrown value to a canonical, secret-free error. */
export function toCanonicalError(err: unknown, secrets: readonly string[] = []): CanonicalError {
  const clean = (s: string) => redactSecrets(s, secrets);
  if (err instanceof RunAbortedError) {
    return { code: err.kind === 'timeout' ? 'TIMEOUT' : 'CANCELLED', message: err.message, retryable: err.kind === 'timeout' };
  }
  if (err instanceof LabError) {
    return {
      code: err.code,
      message: clean(err.message),
      retryable: err.retryable,
      details: err.details?.map((d) => ({ path: d.path, message: clean(d.message) })),
    };
  }
  if (err instanceof ZodError) {
    return { code: 'VALIDATION_FAILED', message: 'Validation failed', retryable: false, details: zodDetails(err) };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'CANCELLED', message: 'Operation aborted', retryable: false };
  }
  return { code: 'INTERNAL', message: 'Lab execution failed', retryable: false };
}
