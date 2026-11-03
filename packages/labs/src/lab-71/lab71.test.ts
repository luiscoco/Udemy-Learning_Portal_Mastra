import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { backup, listBackups, restore, verifyBackup } from './backup.js';
import { appliedMigrations, checksumOf, migrate, MIGRATIONS, schemaVersion } from './migrations.js';
import { sweep, DEFAULT_RETENTION } from './retention.js';
import { DurableStore } from './store.js';
import { lab71Definition } from './definition.js';
import { Lab71InputSchema, lab71, type Lab71Output } from './run.js';

const tmp = mkdtempSync(join(tmpdir(), 'mlp-l71-'));
let n = 0;
const dbPath = () => join(tmp, `t${++n}.db`);
const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-71') });
const runner = new LabRunner({
  registry: new LabRegistry([lab71]),
  services,
  servicesFor: (o) => services.forTenant(o),
  liveEnabled: false,
});
afterAll(async () => {
  runner.dispose();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows: libSQL keeps closed files locked until the process exits (see COMPATIBILITY.md)
  }
});
const base = lab71Definition.exampleInput;

async function run(input: Record<string, unknown>, ownerId = 'dev:l71') {
  const r = runner.start('lab-71', { input: { ...base, ...input } }, { ownerId });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  return {
    snap,
    events,
    result: result?.type === 'result' ? result : undefined,
    out: (result?.type === 'result' ? result.output : undefined) as Lab71Output,
  };
}

describe('migrations (integration, real libSQL files)', () => {
  it('migrates a v1 database holding data to v3 without losing rows, and backfills the new column', async () => {
    const s = await DurableStore.open(dbPath());
    try {
      expect((await migrate(s.client, { target: 1 })).applied.map((a) => a.version)).toEqual([1]);
      await s.upsertProgress('o', { labId: 'lab-01', lessonRead: true, runSucceeded: true, checksPassed: true });
      await s.upsertProgress('o', { labId: 'lab-02', lessonRead: true, runSucceeded: false, checksPassed: false });
      await s.recordRun('o', {
        runId: 'r1',
        labId: 'lab-01',
        status: 'succeeded',
        startedAt: 'a',
        finishedAt: 'b',
        summary: { x: 1 },
      });
      const r = await migrate(s.client);
      expect(r).toMatchObject({ from: 1, to: 3 });
      expect(r.applied.map((a) => a.version)).toEqual([2, 3]);
      expect(await schemaVersion(s.client)).toBe(3);
      const p = await s.progress('o');
      expect(p.map((x) => [x.labId, x.quizBest])).toEqual([
        ['lab-01', 0],
        ['lab-02', null],
      ]);
      expect((await s.runs('o'))[0]?.summary).toEqual({ x: 1 });
      expect((await appliedMigrations(s.client)).map((a) => a.checksum)).toEqual(MIGRATIONS.map(checksumOf));
      expect((await migrate(s.client)).applied).toEqual([]); // idempotent
    } finally {
      await s.close();
    }
  });

  it('rolls a failing migration back completely', async () => {
    const s = await DurableStore.open(dbPath());
    try {
      const r = await migrate(s.client, { failAfterFirstStatementOf: 3 });
      expect(r.failed?.version).toBe(3);
      expect(r.to).toBe(2);
      expect(await schemaVersion(s.client)).toBe(2);
      expect(await s.hasColumn('app_progress', 'quiz_best')).toBe(false);
      expect((await appliedMigrations(s.client)).map((a) => a.version)).toEqual([1, 2]);
      expect((await migrate(s.client)).applied.map((a) => a.version)).toEqual([3]);
    } finally {
      await s.close();
    }
  });

  it('refuses checksum drift, databases newer than the code, and going backwards', async () => {
    const s = await DurableStore.open(dbPath());
    try {
      await migrate(s.client);
      const edited = MIGRATIONS.map((m) => (m.version === 2 ? { ...m, statements: [...m.statements, 'SELECT 1'] } : m));
      await expect(migrate(s.client, { migrations: edited })).rejects.toThrow(/changed after it was applied/);
      await expect(migrate(s.client, { migrations: MIGRATIONS.slice(0, 2) })).rejects.toThrow(/newer than this code/);
      await expect(migrate(s.client, { target: 2 })).rejects.toThrow(/forward-only/);
    } finally {
      await s.close();
    }
  });
});

describe('backups and retention', () => {
  it('backs up a live database, verifies, rotates, restores atomically and refuses a corrupted snapshot', async () => {
    const file = dbPath();
    const dir = join(tmp, `b${n}`);
    const s = await DurableStore.open(file);
    try {
      await migrate(s.client);
      await s.upsertProgress('o', { labId: 'lab-01', lessonRead: true, runSucceeded: false, checksPassed: false });
      await s.mem.memory.createThread({ resourceId: 'r', threadId: 't1', title: 't' });
      const t0 = Date.parse('2026-01-01T00:00:00Z');
      for (let i = 0; i < 3; i++) await backup(s.client, dir, { keep: 2, now: new Date(t0 + i * 1000) });
      const kept = listBackups(dir);
      expect(kept).toHaveLength(2);
      expect(kept[0]).toMatch(/^2026-01-01T00-00-02/);
      const v = await verifyBackup(dir, kept[0]!);
      expect(v).toMatchObject({ ok: true, problems: [] });
      expect(v.manifest?.counts).toMatchObject({ progress: 1, threads: 1 });

      // Data written after the backup is not in it. (Restoring over a database this process opened is covered
      // by the two-process test: on Windows a libSQL file stays locked until its process exits.)
      await s.upsertProgress('o', { labId: 'lab-02', lessonRead: true, runSucceeded: false, checksPassed: false });
    } finally {
      await s.close();
    }
    const restored = dbPath();
    await restore(dir, listBackups(dir)[0]!, restored);
    const back = await DurableStore.open(restored);
    try {
      expect((await back.progress('o')).map((p) => p.labId)).toEqual(['lab-01']);
      expect(await schemaVersion(back.client)).toBe(3);
    } finally {
      await back.close();
    }

    const victim = join(dir, listBackups(dir)[0]!);
    const bytes = readFileSync(victim);
    bytes[100] = bytes[100]! ^ 0xff;
    writeFileSync(victim, bytes);
    expect((await verifyBackup(dir, listBackups(dir)[0]!)).problems).toContain(
      'the snapshot bytes do not match the manifest hash',
    );
    await expect(restore(dir, listBackups(dir)[0]!, dbPath())).rejects.toThrow(/Restore refused/);
  });

  it('sweeps runs by age and by the per-lab cap in one transaction', async () => {
    const s = await DurableStore.open(dbPath());
    try {
      await migrate(s.client);
      const now = new Date('2026-06-01T00:00:00Z');
      const day = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
      for (const [id, d] of [
        ['old1', 40],
        ['old2', 31],
        ['new1', 10],
        ['new2', 1],
      ] as const)
        await s.recordRun('o', {
          runId: id,
          labId: 'lab-01',
          status: 'succeeded',
          startedAt: day(d),
          finishedAt: day(d),
          summary: {},
        });
      for (let i = 0; i < 4; i++)
        await s.recordRun('o', {
          runId: `cap${i}`,
          labId: 'lab-02',
          status: 'succeeded',
          startedAt: day(i),
          finishedAt: day(i),
          summary: {},
        });
      const r = await sweep(s.client, { ...DEFAULT_RETENTION, runDays: 30, runsPerLab: 2 }, now);
      expect(r).toMatchObject({ expiredByAge: 2, expiredByCap: 2, remaining: 4 });
      expect((await s.runs('o')).map((x) => x.runId).sort()).toEqual(['cap0', 'cap1', 'new1', 'new2']);
    } finally {
      await s.close();
    }
  });
});

describe('Lab 71', () => {
  it('runs every phase on a fresh database and passes its checks', async () => {
    const { snap, events, result, out } = await run({});
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed, JSON.stringify(result?.validation)).toBe(true);
    const steps = events.flatMap((e) => (e.type === 'workflow-step' && e.status === 'success' ? [e.stepId] : []));
    expect(steps).toEqual(['migrate', 'write', 'restart', 'backup', 'restore-drill', 'retention']);
    expect(out.restart.before).toEqual(out.restart.after);
    expect(out.restart.before).toMatchObject({ progress: 2, documents: 1, runs: 1, threads: 1, messages: 2 });
    expect(out.corruption?.detected).toBe(true);
    expect(out.retention?.expiredByAge).toBe(3);
  });

  it('the durable database keeps data between runs and refuses to go backwards', async () => {
    const owner = 'dev:l71-durable';
    const first = await run({ store: 'durable', note: 'First note.' }, owner);
    expect(first.result?.validation?.passed).toBe(true);
    const second = await run({ store: 'durable', note: 'Second note.' }, owner);
    expect(second.result?.validation?.passed).toBe(true);
    expect(second.out.migration.applied).toEqual([]);
    expect(second.out.restart.recalled).toEqual(['First note.', 'Second note.']);
    expect(second.out.restart.after.runs).toBeGreaterThanOrEqual(2);
    const back = await run({ store: 'durable', targetVersion: 2 }, owner);
    expect(back.snap.status).toBe('succeeded');
    expect(back.out.migration.refused).toMatch(/forward-only/);
    expect(back.result?.validation?.checks.find((c) => c.id === 'migrations-applied')?.passed).toBe(false);
  });

  it('validates inputs', () => {
    expect(Lab71InputSchema.safeParse({ ...base, targetVersion: 4 }).success).toBe(false);
    expect(Lab71InputSchema.safeParse({ ...base, note: '' }).success).toBe(false);
    expect(Lab71InputSchema.safeParse({ ...base, retentionDays: 0 }).success).toBe(false);
  });
});
