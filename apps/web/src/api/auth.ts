import { SessionResponseSchema, type LoginRequest, type SessionResponse } from '@mlp/contracts';
import { getJson, toApiClientError } from './client';

export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  return SessionResponseSchema.parse(await getJson('/api/auth/session', signal));
}

async function post(path: string, body?: LoginRequest): Promise<SessionResponse> {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await toApiClientError(res);
  return SessionResponseSchema.parse(await res.json());
}
export const login = (body: LoginRequest) => post('login', body);
export const logout = () => post('logout');
