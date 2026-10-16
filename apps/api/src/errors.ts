import type { ApiError, ApiErrorCode } from '@mlp/contracts';

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  TIMEOUT: 504,
  CANCELLED: 499,
  PROVIDER_ERROR: 502,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/** Typed error carrying a canonical API error code. */
export class HttpError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export function statusFor(code: ApiErrorCode): number {
  return STATUS[code];
}

export function errorBody(code: ApiErrorCode, message: string, extra?: Partial<ApiError['error']>): ApiError {
  return { error: { code, message, ...extra } };
}
