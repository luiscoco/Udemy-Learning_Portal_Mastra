// Definition of done for L21: thread context survives a REAL process restart.
// Two separate Node processes share one SQLite file; the second never saw the first's objects.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { labsPackageDir } from '../paths.js';

const run = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'mlp-l21-'));
const db = join(dir, 'restart.db');
const worker = join(labsPackageDir(), 'src', 'lab-21', 'restart-worker.ts');
const repoRoot = join(labsPackageDir(), '..', '..');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function phase(name: 'write' | 'read') {
  const { stdout } = await run(process.execPath, ['--import', 'tsx', worker, db, name], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }, // no provider keys
    timeout: 60_000,
  });
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
}

describe('lab-21 real process restart', () => {
  it('a new process recalls the thread written by a process that has exited', async () => {
    const write = await phase('write');
    const read = await phase('read');
    expect(read.pid).not.toBe(write.pid);
    expect(read.recalledUserTexts).toEqual(['My name is Ana.', 'I prefer trains.']);
    const times = (read.recalled as { createdAt: string }[]).map((m) => Date.parse(m.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect((read.recalled as { role: string }[]).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    // The new process's agent turn received the persisted history as context.
    expect(read.modelSaw).toEqual(['My name is Ana.', 'I prefer trains.', 'What do you remember?']);
  }, 120_000);
});
