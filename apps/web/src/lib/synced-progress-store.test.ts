import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@mlp/client';
import { emptyProgress, type ProgressEntry, type ProgressSnapshot } from '@mlp/contracts';
import { fakeProgressApi } from '../test-progress-api';
import { progressKey, storageScopeOf } from './storage-scope';
import { SyncedProgressStore, syncedProgressKey } from './synced-progress-store';

const stores: SyncedProgressStore[] = [];
const create = (server: ReturnType<typeof fakeProgressApi>, storage: Storage = localStorage) => {
  const store = new SyncedProgressStore(server.api, storage, 100000);
  stores.push(store);
  return store;
};
const note = (notes: string) => ({ ...emptyProgress('lab-00'), notes });
const activate = async (store: SyncedProgressStore, subject = 'dev:alice') => {
  store.setIdentity(subject);
  await store.retrySync();
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  stores.splice(0).forEach((s) => s.dispose());
});

describe('account progress synchronization', () => {
  it('imports missing legacy records, preserves account data and retains the original backup', async () => {
    const server = fakeProgressApi();
    const scope = storageScopeOf({ sub: 'dev:alice' });
    const old = { 'lab-00': note('Old notes'), 'lab-01': { ...emptyProgress('lab-01'), notes: 'Older device note' } };
    localStorage.setItem(progressKey(scope), JSON.stringify({ version: 1, records: old }));
    await server.api.save('dev:alice', 'lab-01', { baseRevision: 0, record: { ...old['lab-01'], notes: 'Account version' } });
    const store = create(server);
    await activate(store);
    expect(store.get('lab-00')?.notes).toBe('Old notes');
    expect(store.get('lab-01')?.notes).toBe('Account version');
    expect(JSON.parse(localStorage.getItem(progressKey(scope))!).records).toEqual(old);
    expect(store.exportBackup()).toMatchObject({ records: old });
    expect(store.getSyncState()).toMatchObject({ phase: 'saved', pending: 0, hasBackup: true });
  });
  it('keeps guest progress local, claims it on sign-in and isolates later accounts', async () => {
    const server = fakeProgressApi();
    const store = create(server);
    store.save(note('Guest note'));
    expect(server.api.save).not.toHaveBeenCalled();
    await activate(store);
    expect(server.account('dev:alice').get('lab-00')?.record?.notes).toBe('Guest note');
    store.setIdentity(null);
    expect(store.getAll()).toEqual({});
    await activate(store, 'dev:bob');
    expect(store.getAll()).toEqual({});
    await activate(store);
    expect(store.get('lab-00')?.notes).toBe('Guest note');
    expect(syncedProgressKey('dev:a/b')).not.toBe(syncedProgressKey('dev:a%2Fb'));
  });
  it('restores an offline outbox after reload and retries without discarding notes', async () => {
    const server = fakeProgressApi();
    const save = server.api.save.getMockImplementation()!;
    const first = create(server);
    await activate(first);
    server.api.save.mockRejectedValue(new ApiClientError('NETWORK', 'offline', 0));
    first.save(note('Offline draft'));
    await first.retrySync();
    expect(first.getSyncState()).toMatchObject({ phase: 'offline', pending: 1, localDurable: true });
    first.dispose();
    const reloaded = create(server);
    await activate(reloaded);
    expect(reloaded.get('lab-00')?.notes).toBe('Offline draft');
    server.api.save.mockImplementation(save);
    await reloaded.retrySync();
    expect(reloaded.getSyncState()).toMatchObject({ phase: 'saved', pending: 0 });
    expect(server.account('dev:alice').get('lab-00')?.record?.notes).toBe('Offline draft');
  });
  it('does not lose a newer edit while an older save is in flight', async () => {
    const server = fakeProgressApi();
    const save = server.api.save.getMockImplementation()!;
    const store = create(server);
    await activate(store);
    let release!: (entry: ProgressEntry) => void;
    server.api.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    store.save(note('First'));
    const flushing = store.retrySync();
    await vi.waitFor(() => expect(server.api.save).toHaveBeenCalledTimes(1));
    store.save(note('Second'));
    release(await save('dev:alice', 'lab-00', { baseRevision: 0, record: note('First') }));
    await flushing;
    expect(store.get('lab-00')?.notes).toBe('Second');
    expect(server.account('dev:alice').get('lab-00')).toMatchObject({ revision: 2, record: { notes: 'Second' } });
    expect(server.api.save.mock.calls[1]?.[2].baseRevision).toBe(1);
  });
  it('retains conflicts and supports choosing either the account or device version', async () => {
    const server = fakeProgressApi();
    await server.api.save('dev:alice', 'lab-00', { record: note('Initial'), baseRevision: 0 });
    const store = create(server);
    await activate(store);
    await server.api.save('dev:alice', 'lab-00', { record: note('Another device'), baseRevision: 1 });
    store.save(note('My draft'));
    await store.retrySync();
    expect(store.getSyncState()).toMatchObject({ phase: 'conflict', conflicts: ['lab-00'] });
    expect(store.get('lab-00')?.notes).toBe('My draft');
    await store.resolveConflict('lab-00', 'server');
    expect(store.get('lab-00')?.notes).toBe('Another device');
    await server.api.save('dev:alice', 'lab-00', { record: note('Another update'), baseRevision: 2 });
    store.save(note('Keep my newest draft'));
    await store.retrySync();
    await store.resolveConflict('lab-00', 'device');
    expect(server.account('dev:alice').get('lab-00')).toMatchObject({ revision: 4, record: { notes: 'Keep my newest draft' } });
  });
  it('never resurrects a reset from legacy browser records', async () => {
    const server = fakeProgressApi();
    await server.api.reset('dev:alice', 'lab-00', { baseRevision: 0 });
    localStorage.setItem(
      progressKey(storageScopeOf({ sub: 'dev:alice' })),
      JSON.stringify({ version: 1, records: { 'lab-00': note('Old') } }),
    );
    const store = create(server);
    await activate(store);
    expect(store.get('lab-00')).toBeUndefined();
    expect(server.api.import).not.toHaveBeenCalled();
    store.clear('lab-00');
    await store.retrySync();
    expect(server.account('dev:alice').get('lab-00')).toMatchObject({ revision: 2, record: null });
  });
  it('ignores a late read response after switching accounts', async () => {
    const server = fakeProgressApi();
    const get = server.api.get.getMockImplementation()!;
    await server.api.save('dev:bob', 'lab-00', { record: note('Bob'), baseRevision: 0 });
    let release!: (snapshot: ProgressSnapshot) => void;
    server.api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const store = create(server);
    store.setIdentity('dev:alice');
    const alice = store.retrySync();
    await activate(store, 'dev:bob');
    release({ entries: [{ labId: 'lab-00', revision: 1, record: note('Alice'), updatedAt: new Date().toISOString() }] });
    await alice;
    expect(store.get('lab-00')?.notes).toBe('Bob');
    expect(server.api.save.mock.calls.every(([subject]) => subject === 'dev:bob')).toBe(true);
    expect(await get('dev:alice')).toEqual({ entries: [] });
  });
  it('ignores a late save acknowledgment and leaves its queue attached to the old account', async () => {
    const server = fakeProgressApi();
    const save = server.api.save.getMockImplementation()!;
    const store = create(server);
    await activate(store);
    let release!: (entry: ProgressEntry) => void;
    server.api.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    store.save(note('Alice private draft'));
    const pending = store.retrySync();
    await vi.waitFor(() => expect(server.api.save).toHaveBeenCalledTimes(1));
    await activate(store, 'dev:bob');
    release(await save('dev:alice', 'lab-00', { record: note('Alice private draft'), baseRevision: 0 }));
    await pending;
    expect(store.getAll()).toEqual({});
    expect(server.account('dev:bob').size).toBe(0);
    expect(JSON.parse(localStorage.getItem(syncedProgressKey('dev:alice'))!).pending['lab-00'].record.notes).toBe(
      'Alice private draft',
    );
  });
  it('preserves edits made before initial hydration and reports unavailable browser storage', async () => {
    const server = fakeProgressApi();
    let release!: (snapshot: ProgressSnapshot) => void;
    server.api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const failing: Storage = {
      length: 0,
      clear() {},
      key: () => null,
      removeItem() {},
      getItem: () => null,
      setItem() {
        throw new Error('quota');
      },
    };
    const store = create(server, failing);
    store.setIdentity('dev:alice');
    store.save(note('Typed while loading'));
    const pending = store.retrySync();
    expect(store.getSyncState().localDurable).toBe(false);
    release({ entries: [] });
    await pending;
    expect(server.account('dev:alice').get('lab-00')?.record?.notes).toBe('Typed while loading');
    expect(store.getSyncState().phase).toBe('saved');
  });
});
