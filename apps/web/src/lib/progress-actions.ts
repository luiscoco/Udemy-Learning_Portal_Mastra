import { useCallback } from 'react';
import { deriveProgressStatus, emptyProgress, type ProgressRecord } from '@mlp/contracts';
import { useLabProgress, useProgressStore } from './progress-context';

export type ProgressPatch = Partial<Omit<ProgressRecord, 'labId' | 'status' | 'updatedAt'>>;

/** Applies a patch to a lab's progress, recomputing status and timestamp. */
export function applyProgressPatch(current: ProgressRecord | undefined, labId: string, patch: ProgressPatch, now = new Date()) {
  const base = current ?? emptyProgress(labId, now);
  const merged = { ...base, ...patch, labId };
  return { ...merged, status: deriveProgressStatus(merged), updatedAt: now.toISOString() } satisfies ProgressRecord;
}

export function useProgressActions(labId: string) {
  const store = useProgressStore();
  const record = useLabProgress(labId);
  const update = useCallback(
    (patch: ProgressPatch | ((current: ProgressRecord) => ProgressPatch)) => {
      const current = store.get(labId) ?? emptyProgress(labId);
      const resolved = typeof patch === 'function' ? patch(current) : patch;
      store.save(applyProgressPatch(current, labId, resolved));
    },
    [store, labId],
  );
  const reset = useCallback(() => store.clear(labId), [store, labId]);
  return { record: record ?? emptyProgress(labId), update, reset };
}
