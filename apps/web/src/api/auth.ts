import type { LoginRequest, SessionResponse } from '@mlp/contracts';
import { api } from './client';

export function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  return api.auth.session(signal);
}
export const login = (body: LoginRequest): Promise<SessionResponse> => api.auth.login(body);
export const localSession = (signal?: AbortSignal): Promise<SessionResponse> => api.auth.localSession(signal);
export const logout = (): Promise<SessionResponse> => api.auth.logout();
