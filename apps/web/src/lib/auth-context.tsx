import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginRequest, SessionResponse } from '@mlp/contracts';
import * as auth from '../api/auth';

interface AuthState {
  status: 'loading' | 'ready' | 'error';
  session: SessionResponse | null;
  error: string | null;
}
interface AuthContextValue extends AuthState {
  signIn: (credentials: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  invalidate: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Cannot check your session. Please retry.');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, error: null });
  const accept = useCallback((session: SessionResponse) => setState({ status: 'ready', session, error: null }), []);
  const refresh = useCallback(async () => {
    try {
      accept(await auth.getSession());
    } catch (err) {
      setState({ status: 'error', session: null, error: messageOf(err) });
    }
  }, [accept]);
  useEffect(() => {
    const ctrl = new AbortController();
    void auth
      .getSession(ctrl.signal)
      .then(accept)
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', session: null, error: messageOf(err) });
      });
    return () => ctrl.abort();
  }, [accept]);
  const invalidate = useCallback(
    () =>
      setState((cur) => ({
        ...cur,
        session: cur.session ? { ...cur.session, authenticated: false, principal: null, expiresAt: null } : null,
      })),
    [],
  );
  useEffect(() => {
    if (!state.session?.authenticated || !state.session.expiresAt) return;
    const timer = setTimeout(invalidate, Math.max(0, Date.parse(state.session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [state.session, invalidate]);
  const signIn = useCallback(async (credentials: LoginRequest) => accept(await auth.login(credentials)), [accept]);
  const signOut = useCallback(async () => accept(await auth.logout()), [accept]);
  return <AuthContext.Provider value={{ ...state, signIn, signOut, refresh, invalidate }}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession requires AuthProvider');
  return ctx;
}

/** Resolve against a fixed origin to reject protocol-relative, backslash and encoded redirect tricks. */
export function safeReturnPath(path: string | null): string {
  if (!path?.startsWith('/') || path.startsWith('//') || [...path].some((char) => char === '\\' || char.charCodeAt(0) < 32))
    return '/';
  try {
    const url = new URL(path, 'https://learning.invalid');
    return url.origin === 'https://learning.invalid' && url.pathname !== '/login'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}
