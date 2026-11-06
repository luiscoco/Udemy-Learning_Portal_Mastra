import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lab00Definition } from '../../../packages/labs/src/lab-00/definition';
import { safeReturnPath } from './lib/auth-context';
import { jsonResponse, renderApp, signedInSession } from './test-utils';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());
const anonymous = {
  ...signedInSession,
  authenticated: false,
  principal: null,
  expiresAt: null,
  login: { kind: 'dev', passwordRequired: true },
};

describe('sign-in', () => {
  it('shows the sign-in gate without starting a run', async () => {
    const fetcher = vi.fn(async (url: string) => jsonResponse(url === '/api/auth/session' ? anonymous : lab00Definition));
    vi.stubGlobal('fetch', fetcher);
    renderApp('/labs/lab-00?tab=run');
    expect(await screen.findByRole('heading', { name: 'Sign in to run labs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/runs'))).toBe(false);
  });
  it('submits a passcode, shows generic failure and returns to the local lab after login', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/auth/session') return jsonResponse(anonymous);
      if (url === '/api/auth/login')
        return ++attempts === 1
          ? jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid user name or passcode.' } }, 401)
          : jsonResponse(signedInSession);
      return jsonResponse(lab00Definition);
    });
    vi.stubGlobal('fetch', fetcher);
    const { router } = renderApp('/login?next=%2Flabs%2Flab-00');
    const password = await screen.findByLabelText('Passcode');
    await user.type(password, 'invented-code');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid user name or passcode.');
    expect(password).toHaveValue('');
    await user.type(password, 'invented-code');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/labs/lab-00'));
    expect(localStorage.getItem('mlp_session')).toBeNull();
  });
  it('requires sign-in again after an expired session yields 401', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/session') return jsonResponse(signedInSession);
        if (url.endsWith('/runs')) return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Sign in to run labs.' } }, 401);
        if (url.endsWith('/preflight')) return jsonResponse({ labId: 'lab-00', ready: true, checks: [] });
        return jsonResponse(lab00Definition);
      }),
    );
    renderApp('/labs/lab-00?tab=run');
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to run labs' })).toBeInTheDocument();
  });
  it('automatically enters the local learner and enables Tutor without a sign-in form', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/auth/session')
        return jsonResponse({ ...anonymous, login: { kind: 'dev', passwordRequired: false, autoLocal: true } });
      if (url === '/api/auth/local-session')
        return jsonResponse({ ...signedInSession, login: { kind: 'dev', passwordRequired: false, autoLocal: true } });
      if (url === '/api/tutor/settings')
        return jsonResponse({ liveEnabled: false, models: [], questionLimit: 2000, answerLimit: 16000, timeoutMs: 60000 });
      return jsonResponse(lab00Definition);
    });
    vi.stubGlobal('fetch', fetcher);
    renderApp('/labs/lab-00');
    expect(await screen.findByText('Local learner: learner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AI Tutor' }));
    expect(screen.getByRole('button', { name: 'Ask tutor' })).toBeEnabled();
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/auth/local-session')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url === '/api/tutor/answer')).toBe(false);
  });
  it('preserves an existing session without requesting local entry', async () => {
    const fetcher = vi.fn(async (url: string) =>
      jsonResponse(
        url === '/api/auth/session'
          ? { ...signedInSession, login: { kind: 'dev', passwordRequired: false, autoLocal: true } }
          : lab00Definition,
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    renderApp('/labs/lab-00');
    await screen.findByText('Local learner: learner');
    expect(fetcher.mock.calls.some(([url]) => url === '/api/auth/local-session')).toBe(false);
  });
  it('offers retry when automatic entry fails without submitting a Tutor question', async () => {
    const user = userEvent.setup();
    let fail = true;
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/auth/session')
        return jsonResponse({ ...anonymous, login: { kind: 'dev', passwordRequired: false, autoLocal: true } });
      if (url === '/api/auth/local-session') {
        if (fail) return jsonResponse({ error: { code: 'INTERNAL', message: 'Session temporarily unavailable' } }, 500);
        return jsonResponse({ ...signedInSession, login: { kind: 'dev', passwordRequired: false, autoLocal: true } });
      }
      if (url === '/api/tutor/settings')
        return jsonResponse({ liveEnabled: false, models: [], questionLimit: 2000, answerLimit: 16000, timeoutMs: 60000 });
      return jsonResponse(lab00Definition);
    });
    vi.stubGlobal('fetch', fetcher);
    renderApp('/labs/lab-00');
    await user.click(await screen.findByRole('button', { name: 'AI Tutor' }));
    expect(await screen.findByRole('button', { name: 'Retry learner session' })).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry learner session' }));
    await screen.findByText('Local learner: learner');
    expect(fetcher.mock.calls.some(([url]) => url === '/api/tutor/answer')).toBe(false);
  });
  it('rejects external and ambiguous return paths', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', 'javascript:alert(1)', '/\nevil'])
      expect(safeReturnPath(path)).toBe('/');
    expect(safeReturnPath('/labs/lab-61?tab=run')).toBe('/labs/lab-61?tab=run');
  });
});
