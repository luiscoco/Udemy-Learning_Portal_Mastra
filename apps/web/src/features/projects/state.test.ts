import { afterEach, expect, it, vi } from 'vitest';
import { emptyProjectState, loadProjectState, projectStorageKey, ProjectStateSchema } from './state';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('isolates learners and projects while restoring valid evidence', () => {
  const alice = projectStorageKey('dev:alice', 'study-coach');
  localStorage.setItem(alice, JSON.stringify({ ...emptyProjectState(), notes: 'Alice evidence' }));
  expect(loadProjectState(alice).data.notes).toBe('Alice evidence');
  expect(loadProjectState(projectStorageKey('dev:bob', 'study-coach')).data.notes).toBe('');
  expect(loadProjectState(projectStorageKey('dev:alice', 'publishing-studio')).data.notes).toBe('');
});
it('handles malformed, oversized and blocked storage visibly', () => {
  for (const raw of ['{bad', '{}', 'x'.repeat(1500001)]) {
    localStorage.setItem('broken', raw);
    expect(loadProjectState('broken').warning).toContain('JSON backup');
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(loadProjectState('blocked').data).toEqual(emptyProjectState());
  expect(loadProjectState('blocked').warning).not.toBe('');
});
it('refuses unbounded state and incomplete answer records', () => {
  expect(ProjectStateSchema.safeParse({ ...emptyProjectState(), notes: 'x'.repeat(20001) }).success).toBe(false);
  expect(ProjectStateSchema.safeParse({ ...emptyProjectState(), answers: [{ text: 'partial' }] }).success).toBe(false);
});
