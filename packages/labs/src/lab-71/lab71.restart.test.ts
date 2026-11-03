// Definition of done for L71: durable data survives a REAL process restart, and a backup restores over the
// database in a new process. Each phase is its own Node process; none sees another's objects.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { labsPackageDir } from '../paths.js';

const run = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'mlp-l71r-'));
const worker = join(labsPackageDir(), 'src', 'lab-71', 'restart-worker.ts');
const repoRoot = join(labsPackageDir(), '..', '..');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Phase {
  pid: number;
  version: number;
  applied: number[] | number;
  counts: Record<string, number>;
  progress: string[];
  documents: string[];
  runs: string[];
  messages: string[];
  verified?: boolean;
}

async function phase(name: 'write' | 'read' | 'mutate' | 'restore'): Promise<Phase> {
  const { stdout } = await run(process.execPath, ['--import', 'tsx', worker, dir, name], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }, // no provider keys
    timeout: 60_000,
  });
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as Phase;
}

describe('lab-71 real process restart and restore', () => {
  it('a new process reads progress, documents, runs and the thread; a restore in another process rolls back later writes', async () => {
    const write = await phase('write');
    expect(write.applied).toEqual([1, 2, 3]);
    expect(write.counts).toEqual({ progress: 1, documents: 1, runs: 1, threads: 1, messages: 2 });

    const read = await phase('read');
    expect(read.pid).not.toBe(write.pid);
    expect(read.version).toBe(3);
    expect(read.applied).toBe(0); // nothing left to migrate
    expect(read.verified).toBe(true);
    expect(read.progress).toEqual(['lab-70:4']);
    expect(read.documents).toEqual(['refund-policy.md']);
    expect(read.runs).toEqual(['run-1']);
    expect(read.messages).toEqual(['user:Backup window is 02:00 UTC.', 'assistant:Noted.']);

    const mutated = await phase('mutate');
    expect(mutated.progress).toEqual(['lab-70:4', 'lab-71:null']);

    const restored = await phase('restore');
    expect(restored.progress).toEqual(['lab-70:4']); // the write after the backup is gone
    expect(restored.counts).toEqual(write.counts);
    expect(restored.messages).toEqual(read.messages);
  }, 180_000);
});
