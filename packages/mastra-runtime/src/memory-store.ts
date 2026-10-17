import { mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

/** Options accepted by `new Memory({ options })` in the installed @mastra/memory. */
export type MemoryOptions = NonNullable<NonNullable<ConstructorParameters<typeof Memory>[0]>['options']>;

export interface OpenedMemory {
  /** Absolute path of the SQLite file backing this store. */
  readonly file: string;
  readonly storage: LibSQLStore;
  readonly memory: Memory;
  /** Closes the database client. Every Mastra object built on this store is unusable afterwards. */
  close(): Promise<void>;
}

/** libSQL wants a `file:` URL with forward slashes (works with spaces in Windows paths). */
export const fileUrl = (file: string) => `file:${file.replace(/\\/g, '/')}`;

/**
 * Opens durable Mastra memory on a local SQLite file (via @mastra/libsql). The directory is created
 * if needed and the schema is initialised before the memory is returned. Callers own the lifecycle:
 * call close() when done (also on errors and cancellation).
 */
export async function openMemory(file: string, options: MemoryOptions = {}): Promise<OpenedMemory> {
  mkdirSync(dirname(file), { recursive: true });
  const storage = new LibSQLStore({ id: `mlp-${basename(file).replace(/\.db$/, '')}`, url: fileUrl(file) });
  await storage.init();
  const memory = new Memory({ storage, options });
  let closed = false;
  return {
    file,
    storage,
    memory,
    async close() {
      if (closed) return;
      closed = true;
      await storage.close();
    },
  };
}
