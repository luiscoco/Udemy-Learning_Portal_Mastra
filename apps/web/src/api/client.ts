import { createApiClient } from '@mlp/client';
import type { HealthResponse, LabDefinition } from '@mlp/contracts';

export { ApiClientError, toApiClientError } from '@mlp/client';

/** The one typed API client of the web app (L66). Same origin; the session cookie authenticates it. */
export const api = createApiClient();

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return api.health(signal);
}

export function fetchLabDefinition(labId: string, signal?: AbortSignal): Promise<LabDefinition> {
  return api.labs.get(labId, signal);
}
