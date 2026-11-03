import { ApiErrorSchema, type ApiErrorCode } from '@mlp/contracts';

/** API error codes, plus two the client produces itself: NETWORK (API unreachable) and CONTRACT (drift). */
export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'CONTRACT';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ClientErrorCode | (string & {}),
    message: string,
    public readonly status: number,
    public readonly details?: { path: string; message: string }[],
    public readonly retryable = false,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Turns an error response into a typed error; a body that is not the error contract becomes INTERNAL. */
export async function toApiClientError(res: Response): Promise<ApiClientError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    const e = parsed.data.error;
    return new ApiClientError(e.code, e.message, res.status, e.details, e.retryable ?? false, e.requestId);
  }
  return new ApiClientError('INTERNAL', `Request failed with status ${res.status}`, res.status);
}
