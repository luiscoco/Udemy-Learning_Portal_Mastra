import type { ExecutionEvent, RunSnapshot } from '@mlp/contracts';

/** Server-only metadata; capabilities are represented by hashes, never raw values. */
export interface PersistedRun {
  ownerId: string | null;
  tokenHashes: readonly string[];
  snapshot: RunSnapshot;
  events: readonly ExecutionEvent[];
}

/** Synchronous commits preserve the engine's existing start/emit interface and write-before-broadcast order. */
export interface RunPersistence {
  create(run: Omit<PersistedRun, 'events'>): readonly string[] | void;
  append(runId: string, event: ExecutionEvent, snapshot: RunSnapshot): void;
  capabilities(runId: string, hashes: readonly string[]): void;
  load(runId: string): PersistedRun | undefined;
  list(ownerId: string, labId: string): RunSnapshot[];
  prune(now: number): readonly string[];
  assertHealthy(): void;
  close(): void;
}
