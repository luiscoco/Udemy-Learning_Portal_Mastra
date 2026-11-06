import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SessionResponse } from '@mlp/contracts';
import * as auth from '../api/auth';
import { AuthProvider, useSession } from './auth-context';

const session = (name = 'learner'): SessionResponse => ({
  authenticated: true,
  principal: { sub: `dev:${name}`, name, provider: 'dev' },
  provider: 'dev',
  login: { kind: 'dev', passwordRequired: false, autoLocal: true },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
});
const anonymous = (): SessionResponse => ({ ...session(), authenticated: false, principal: null, expiresAt: null });
function Probe() {
  const state = useSession();
  return (
    <>
      <output>{state.session?.principal?.name ?? state.status}</output>
      <button onClick={() => void state.signIn({ username: 'bob' })}>Enter Bob</button>
      <button onClick={() => void state.signOut()}>Leave</button>
    </>
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('ignores obsolete initialization after an explicit account action', async () => {
  let resolveInitial!: (value: SessionResponse) => void;
  let initialSignal: AbortSignal | undefined;
  vi.spyOn(auth, 'getSession').mockImplementation((signal) => {
    initialSignal = signal;
    return new Promise((resolve) => {
      resolveInitial = resolve;
    });
  });
  const local = vi.spyOn(auth, 'localSession').mockResolvedValue(session());
  vi.spyOn(auth, 'login').mockResolvedValue(session('bob'));
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Enter Bob'));
  });
  expect(initialSignal?.aborted).toBe(true);
  await act(async () => {
    resolveInitial(anonymous());
  });
  expect(screen.getByRole('status')).toHaveTextContent('bob');
  expect(local).not.toHaveBeenCalled();
});

it('renews an expired local session and keeps explicit logout effective until reload', async () => {
  vi.useFakeTimers();
  vi.spyOn(auth, 'getSession')
    .mockResolvedValueOnce({ ...session(), expiresAt: new Date(Date.now() + 1000).toISOString() })
    .mockResolvedValue(anonymous());
  const local = vi.spyOn(auth, 'localSession').mockImplementation(async () => session());
  vi.spyOn(auth, 'logout').mockResolvedValue(anonymous());
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(local).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('learner');
  await act(async () => {
    fireEvent.click(screen.getByText('Leave'));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(screen.getByRole('status')).toHaveTextContent('ready');
  expect(local).toHaveBeenCalledTimes(1);
});
