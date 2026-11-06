import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    setState((cur) => ({ ...cur, status: 'loading', error: null }));
    try {
      let session = await auth.getSession(ctrl.signal);
      if (!session.authenticated && session.login.autoLocal && !ctrl.signal.aborted)
        session = await auth.localSession(ctrl.signal);
      if (!ctrl.signal.aborted) accept(session);
    } catch (err) {
      if (!ctrl.signal.aborted) setState({ status: 'error', session: null, error: messageOf(err) });
    }
  }, [accept]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
      pending.current?.abort();
    };
  }, [refresh]);
  const invalidate = useCallback(() => {
    setState((cur) => ({
      ...cur,
      session: cur.session ? { ...cur.session, authenticated: false, principal: null, expiresAt: null } : null,
    }));
    if (state.session?.login.autoLocal) void refresh();
  }, [state.session?.login.autoLocal, refresh]);
  useEffect(() => {
    if (!state.session?.authenticated || !state.session.expiresAt) return;
    const timer = setTimeout(
      state.session.login.autoLocal ? () => void refresh() : invalidate,
      Math.max(0, Date.parse(state.session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.session, invalidate, refresh]);
  const signIn = useCallback(
    async (credentials: LoginRequest) => {
      pending.current?.abort();
      accept(await auth.login(credentials));
    },
    [accept],
  );
  const signOut = useCallback(async () => {
    pending.current?.abort();
    accept(await auth.logout());
  }, [accept]);
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
