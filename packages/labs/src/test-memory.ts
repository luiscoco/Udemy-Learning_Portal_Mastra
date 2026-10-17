import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.js';

/**
 * A per-process directory for test databases under <dataDir>/test-memory (gitignored).
 *
 * On Windows, @libsql/client keeps the database file locked after close() until garbage collection, so
 * a test cannot delete its own database. Instead, each test process clears the directories left by
 * earlier processes (unlocked, because those processes have exited) and leaves its own for the next run.
 */
export function testMemoryDir(suite: string): string {
  const root = join(dataDir(), 'test-memory');
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('run-') || entry.startsWith(`run-${process.pid}-`)) continue;
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
