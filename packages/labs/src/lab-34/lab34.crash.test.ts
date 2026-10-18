// Definition of done for L34: a REAL process crash mid-step is recovered by a second process
// without duplicate operations. Two Node processes share one SQLite file and one charge ledger.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { labsPackageDir } from '../paths.js';

const exec = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), 'mlp-l34-'));
const worker = join(labsPackageDir(), 'src', 'lab-34', 'crash-worker.ts');
const repoRoot = join(labsPackageDir(), '..', '..');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function phase(name: 'start' | 'recover') {
  const opts = { cwd: repoRoot, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }, timeout: 60_000 };
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', worker, dir, name], opts).catch((e: { stdout: string; code: number }) => {
    if (name === 'start' && e.code === 1) return e; // the crash is the point
    throw e;
  });
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
}

describe('lab-34 real process crash', () => {
  it('a second process restarts the crashed run; every invoice is charged once', async () => {
    const crashed = await phase('start');
    expect(crashed.crashedIn).toBe('charge-INV-2');
    const recovered = await phase('recover');
    expect(recovered.pid).not.toBe(crashed.pid);
    expect(recovered.active).toBe(1);
    expect(recovered.status).toBe('success');
    expect(recovered.ranAfterRestart).toEqual(['charge-INV-2', 'charge-INV-3']);
    expect(recovered.counts).toEqual({ 'INV-1': 1, 'INV-2': 1, 'INV-3': 1 });
  }, 120_000);
});
