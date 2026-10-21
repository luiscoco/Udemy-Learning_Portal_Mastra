import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { lab00Definition } from '../../../packages/labs/src/lab-00/definition';
import { LocalStorageProgressStore } from './lib/progress-store';
import { claimGuest, GUEST_SCOPE, progressKey, scratchKey, storageScopeOf } from './lib/storage-scope';
import { jsonResponse, renderApp, signedInSession } from './test-utils';

const sessionOf = (sub: string | null) =>
  sub
    ? { ...signedInSession, principal: { sub, name: sub.split(':')[1]!, provider: 'dev' } }
    : { ...signedInSession, authenticated: false, principal: null, expiresAt: null };

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('storage scopes', () => {
  it('derives a stable, name-free scope per learner and guest when signed out', () => {
    const alice = storageScopeOf({ sub: 'dev:alice' });
    expect(alice).toMatch(/^u[0-9a-f]{8}$/);
    expect(alice).toBe(storageScopeOf({ sub: 'dev:alice' }));
    expect(alice).not.toBe(storageScopeOf({ sub: 'dev:bob' }));
    expect(storageScopeOf(null)).toBe(GUEST_SCOPE);
    expect(progressKey(alice)).not.toContain('alice');
  });

  it('claims guest data once and never overwrites a learner’s own data', () => {
    localStorage.setItem('g', 'guest');
    claimGuest(localStorage, 'g', 'a');
    expect(localStorage.getItem('a')).toBe('guest');
    expect(localStorage.getItem('g')).toBeNull();
    localStorage.setItem('g', 'later guest');
    claimGuest(localStorage, 'g', 'a');
    expect(localStorage.getItem('a')).toBe('guest');
    expect(localStorage.getItem('g')).toBe('later guest');
  });
});

describe('LocalStorageProgressStore scopes', () => {
  it('shows each learner only their own progress on a shared browser', () => {
    const alice = storageScopeOf({ sub: 'dev:alice' });
    const bob = storageScopeOf({ sub: 'dev:bob' });
    const store = new LocalStorageProgressStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setScope(alice);
    store.save({ ...emptyProgress('lab-00'), lessonRead: true, status: 'in-progress' });
    store.setScope(GUEST_SCOPE); // Alice signs out
    expect(store.getAll()).toEqual({});
    store.setScope(bob); // Bob signs in
    expect(store.getAll()).toEqual({});
    store.setScope(alice); // Alice is back
    expect(store.get('lab-00')).toMatchObject({ lessonRead: true });
    expect(listener).toHaveBeenCalled();
  });

  it('moves progress saved before scoping to the first learner who signs in', () => {
    localStorage.setItem('mlp.progress.v1', JSON.stringify({ version: 1, records: { 'lab-00': emptyProgress('lab-00') } }));
    const store = new LocalStorageProgressStore();
    store.setScope(storageScopeOf({ sub: 'dev:learner' }));
    expect(Object.keys(store.getAll())).toEqual(['lab-00']);
    store.setScope(GUEST_SCOPE);
    expect(store.getAll()).toEqual({});
  });
});

describe('Scratchpad scopes', () => {
  function stubSession(sub: string | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/session') return jsonResponse(sessionOf(sub));
        if (url === '/api/labs/lab-00') return jsonResponse(lab00Definition);
        if (url === '/api/labs/lab-00/source')
          return jsonResponse({
            labId: 'lab-00',
            pinned: {},
            files: [{ path: 'run.ts', title: 'Lab implementation', language: 'typescript', code: 'export {};' }],
          });
        return jsonResponse({});
      }),
    );
  }
  const scratch = async () => {
    await screen.findByLabelText('Source of run.ts');
    return screen.getByLabelText('Your scratchpad');
  };

  it('a second learner on the same browser does not see the first learner’s notes', async () => {
    const user = userEvent.setup();
    stubSession('dev:alice');
    renderApp('/labs/lab-00?tab=source');
    await screen.findByText('Signed in as alice');
    await user.type(await scratch(), 'Alice private note');
    expect(localStorage.getItem(scratchKey(storageScopeOf({ sub: 'dev:alice' }), 'lab-00'))).toBe('Alice private note');
    cleanup();

    stubSession('dev:bob');
    renderApp('/labs/lab-00?tab=source');
    await screen.findByText('Signed in as bob');
    expect(await scratch()).toHaveValue('');
    cleanup();

    stubSession(null);
    renderApp('/labs/lab-00?tab=source');
    expect(await scratch()).toHaveValue('');
  });
});
