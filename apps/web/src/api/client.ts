import { ApiErrorSchema, HealthResponseSchema, type HealthResponse } from '@mlp/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(path, { headers: { accept: 'application/json' }, signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status);
    throw new ApiClientError('INTERNAL', `Request failed with status ${res.status}`, res.status);
  }
  return body;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return HealthResponseSchema.parse(await getJson('/api/health', signal));
}
