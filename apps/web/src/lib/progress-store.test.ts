import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { LocalStorageProgressStore, MemoryProgressStore } from './progress-store';

beforeEach(() => localStorage.clear());

describe('LocalStorageProgressStore', () => {
  it('starts empty and persists saved records', () => {
    const store = new LocalStorageProgressStore();
    expect(store.getAll()).toEqual({});
    store.save({ ...emptyProgress('lab-00'), lessonRead: true, status: 'in-progress' });
    const reloaded = new LocalStorageProgressStore();
    expect(reloaded.get('lab-00')).toMatchObject({ lessonRead: true, status: 'in-progress' });
  });

  it('ignores corrupt storage instead of crashing', () => {
    localStorage.setItem('mlp.progress.v1', '{not json');
    expect(new LocalStorageProgressStore().getAll()).toEqual({});
  });

  it('drops individually invalid records', () => {
    localStorage.setItem(
      'mlp.progress.v1',
      JSON.stringify({
        version: 1,
        records: { 'lab-00': { labId: 'lab-00', status: 'hacked' }, 'lab-01': emptyProgress('lab-01') },
      }),
    );
    expect(Object.keys(new LocalStorageProgressStore().getAll())).toEqual(['lab-01']);
  });

  it('rejects invalid records on save', () => {
    const store = new LocalStorageProgressStore();
    expect(() => store.save({ ...emptyProgress('lab-00'), notes: 'x'.repeat(10_001) })).toThrow();
  });
});

describe('MemoryProgressStore', () => {
  it('notifies subscribers and clears', () => {
    const store = new MemoryProgressStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.save(emptyProgress('lab-00'));
    store.clear('lab-00');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getAll()).toEqual({});
    off();
  });
});
