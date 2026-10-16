import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { ProgressRecord } from '@mlp/contracts';
import { catalog } from '@mlp/lab-catalog';
import type { ProgressStore } from './progress-store';

const ProgressContext = createContext<ProgressStore | null>(null);

export function ProgressProvider({ store, children }: { store: ProgressStore; children: ReactNode }) {
  return <ProgressContext.Provider value={store}>{children}</ProgressContext.Provider>;
}

export function useProgressStore(): ProgressStore {
  const store = useContext(ProgressContext);
  if (!store) throw new Error('useProgressStore must be used inside <ProgressProvider>');
  return store;
}

export function useAllProgress(): Readonly<Record<string, ProgressRecord>> {
  const store = useProgressStore();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getAll(),
    () => store.getAll(),
  );
}

export function useLabProgress(labId: string): ProgressRecord | undefined {
  return useAllProgress()[labId];
}

export interface CourseProgress {
  totalLabs: number;
  availableLabs: number;
  completedLabs: number;
  inProgressLabs: number;
}

/** Only available labs can count as completed; locked labs never show progress. */
export function useCourseProgress(): CourseProgress {
  const all = useAllProgress();
  return useMemo(() => {
    const available = catalog.labs.filter((l) => l.status === 'available');
    return {
      totalLabs: catalog.labs.length,
      availableLabs: available.length,
      completedLabs: available.filter((l) => all[l.id]?.status === 'completed').length,
      inProgressLabs: available.filter((l) => all[l.id]?.status === 'in-progress').length,
    };
  }, [all]);
}
