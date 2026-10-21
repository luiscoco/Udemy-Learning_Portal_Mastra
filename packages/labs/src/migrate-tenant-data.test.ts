import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { labsPackageDir } from './paths.js';
import { partitionOf } from './services.js';

type Migrate = (
  dataDir: string,
  owner: string,
  opts?: { move?: boolean; dryRun?: boolean },
) => { target: string; report: { action: string }[] };
const script = pathToFileURL(join(labsPackageDir(), '..', '..', 'scripts', 'migrate-tenant-data.mjs')).href;

function legacy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mlp-migrate-'));
  mkdirSync(join(dir, 'memory', 'library'), { recursive: true });
  writeFileSync(join(dir, 'memory', 'lab-21.db'), 'thread');
  writeFileSync(join(dir, 'memory', 'lab-21.db-wal'), 'wal');
  writeFileSync(join(dir, 'memory', 'library', 'abc.json'), '{}');
  mkdirSync(join(dir, 'comparisons'));
  writeFileSync(join(dir, 'comparisons', 'run.json'), '{}');
  return dir;
}

describe('migrate-tenant-data (L62)', () => {
  it('uses the same partition as the services', async () => {
    const { partitionOf: scriptPartition } = (await import(script)) as { partitionOf: (o: string) => string };
    expect(scriptPartition('dev:learner')).toBe(partitionOf('dev:learner'));
  });

  it('copies the legacy stores into one owner’s partition without overwriting, and moves only on request', async () => {
    const { migrate } = (await import(script)) as { migrate: Migrate };
    const dir = legacy();
    const dry = migrate(dir, 'dev:learner', { dryRun: true });
    expect(dry.report.map((r) => r.action)).toEqual(['would copy', 'would copy', 'would copy', 'would copy']);
    expect(existsSync(dry.target)).toBe(false);

    const first = migrate(dir, 'dev:learner');
    const p = join(dir, 'memory', 'tenants', partitionOf('dev:learner'));
    expect(first.target).toBe(p);
    expect(readFileSync(join(p, 'lab-21.db'), 'utf8')).toBe('thread');
    expect(existsSync(join(p, 'library', 'abc.json'))).toBe(true);
    expect(existsSync(join(p, 'files', 'comparisons', 'run.json'))).toBe(true);
    expect(existsSync(join(dir, 'memory', 'lab-21.db'))).toBe(true); // copy, not move

    writeFileSync(join(p, 'lab-21.db'), 'newer');
    const second = migrate(dir, 'dev:learner', { move: true });
    expect(second.report.every((r) => r.action === 'skipped (target exists)')).toBe(true);
    expect(readFileSync(join(p, 'lab-21.db'), 'utf8')).toBe('newer'); // never overwritten
    expect(existsSync(join(dir, 'memory', 'lab-21.db'))).toBe(true); // skipped items are not removed

    const moved = migrate(dir, 'dev:bob', { move: true });
    expect(moved.report.every((r) => r.action === 'moved')).toBe(true);
    expect(existsSync(join(dir, 'comparisons'))).toBe(false);
  });
});
