import type { ApiError, ApiErrorCode } from '@mlp/contracts';

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,
  TIMEOUT: 504,
  CANCELLED: 499,
  PROVIDER_ERROR: 502,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export function statusFor(code: ApiErrorCode): number {
  return STATUS[code];
}

export function errorBody(code: ApiErrorCode, message: string, extra?: Partial<ApiError['error']>): ApiError {
  return { error: { code, message, ...extra } };
}
