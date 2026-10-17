// Definition of done for L32: resume continues from the persisted checkpoint after a REAL process
// restart, without re-running the side effects before it. Two Node processes share one SQLite file.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { labsPackageDir } from '../paths.js';

const run = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'mlp-l32-'));
const worker = join(labsPackageDir(), 'src', 'lab-32', 'restart-worker.ts');
const repoRoot = join(labsPackageDir(), '..', '..');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function phase(...args: string[]) {
  const { stdout } = await run(process.execPath, ['--import', 'tsx', worker, dir, ...args], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }, // no provider keys
    timeout: 60_000,
  });
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
}

describe('lab-32 real process restart', () => {
  it('a new process resumes the suspended run from its checkpoint; earlier side effects ran once', async () => {
    const started = await phase('start');
    expect(started.status).toBe('suspended');
    const resumed = await phase('resume', String(started.runId));
    expect(resumed.pid).not.toBe(started.pid);
    expect(resumed.status).toBe('success');
    expect(resumed.result).toMatchObject({ status: 'active', accountId: 'ACC-1' });
    expect(resumed.counts).toEqual({ 'account-created': 1, 'fee-charged': 1, 'request-drafted': 1, 'account-activated': 1 });
    const pids = resumed.pids as Record<string, number>;
    expect(pids['account-created']).toBe(started.pid); // before the checkpoint: first process only
    expect(pids['account-activated']).toBe(resumed.pid); // after it: the new process
  }, 120_000);
});
