import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.js';

/**
 * A per-process directory for test databases under <dataDir>/test-memory (gitignored).
 *
 * On Windows, @libsql/client keeps the database file locked after close() until garbage collection, so
 * a test cannot delete its own database. Instead, each test process clears the directories left by
 * processes that have exited and leaves its own for the next run. Vitest runs test files in parallel
 * worker processes, so directories of processes that are still alive are never touched.
 */
export function testMemoryDir(suite: string): string {
  const root = join(dataDir(), 'test-memory');
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(root)) {
    const pid = Number(/^run-(\d+)-/.exec(entry)?.[1]);
    if (!pid || isAlive(pid)) continue;
    try {
      rmSync(join(root, entry), { recursive: true, force: true });
    } catch {
      // still locked by a process that is running right now; a later run will clear it
    }
  }
  const dir = join(root, `run-${process.pid}-${suite}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0); // signal 0: existence check only
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists but owned by someone else
  }
}
