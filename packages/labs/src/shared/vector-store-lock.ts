import { KeyedLock } from './keyed-lock.js';

const lock = new KeyedLock();

/**
 * Runs work that writes to or queries a libSQL vector file, one run at a time per file.
 *
 * Verified on @mastra/libsql 1.26.2: when several connections write to the same vector index at once,
 * `vector_top_k` (its approximate-nearest-neighbour search) misses vectors that are present: 8
 * concurrent L24 runs recalled their fact in only 0–5 of 8 cases; serialised, 48 of 48. This lock only
 * covers one process; separate processes sharing a file need a server-side vector store instead.
 */
export function withVectorStore<T>(file: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return lock.run(file, work, signal);
}
