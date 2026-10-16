import {
  ApiErrorSchema,
  HealthResponseSchema,
  LabDefinitionSchema,
  type HealthResponse,
  type LabDefinition,
} from '@mlp/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: { path: string; message: string }[],
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function toApiClientError(res: Response): Promise<ApiClientError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    const e = parsed.data.error;
    return new ApiClientError(e.code, e.message, res.status, e.details, e.retryable ?? false);
  }
  return new ApiClientError('INTERNAL', `Request failed with status ${res.status}`, res.status);
}

export async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: 'application/json' }, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiClientError('NETWORK', 'Cannot reach the API. Is `npm run dev` running?', 0, undefined, true);
  }
  if (!res.ok) throw await toApiClientError(res);
  return res.json();
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return HealthResponseSchema.parse(await getJson('/api/health', signal));
}

export async function fetchLabDefinition(labId: string, signal?: AbortSignal): Promise<LabDefinition> {
  return LabDefinitionSchema.parse(await getJson(`/api/labs/${encodeURIComponent(labId)}`, signal));
}
