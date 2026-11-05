import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'libsql';
import { afterEach, expect, it, vi } from 'vitest';
import { LabRegistry, LabRunner, makeTestLab } from '@mlp/lab-engine';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { SqliteRunJournal } from './run-journal.js';

const root = testMemoryDir('run-journal');
const SECRET = 'test-journal-integrity-secret-at-least-32-characters';
let sequence = 0;
const journals: SqliteRunJournal[] = [],
  runners: LabRunner[] = [];
const fresh = () => join(root, String(++sequence));
function open(dir: string, extra: Partial<ConstructorParameters<typeof SqliteRunJournal>[1]> = {}) {
  const journal = new SqliteRunJournal(dir, { secret: SECRET, ...extra });
  journals.push(journal);
  return journal;
}
function engine(journal: SqliteRunJournal) {
  const lab = makeTestLab(),
    run = vi.fn(lab.run);
  const runner = new LabRunner({
    registry: new LabRegistry([{ ...lab, run }]),
    services: {},
    liveEnabled: false,
    persistence: journal,
  });
  runners.push(runner);
  return { runner, run };
}
function sql(dir: string, statement: string) {
  const db = new Database(join(dir, 'runs', 'executions.db'));
  try {
    return db.prepare(statement).all();
  } finally {
    db.close();
  }
}
function initial() {
  return {
    ownerId: 'dev:alice',
    tokenHashes: [createHash('sha256').update('test-token-value').digest('hex')],
    snapshot: {
      runId: randomUUID(),
      labId: 'lab-99',
      correlationId: randomUUID(),
      status: 'running' as const,
      mode: 'offline' as const,
      startedAt: new Date().toISOString(),
      deadlineMs: 2000,
      eventCount: 0,
      pendingApprovals: 0,
    },
  };
}
afterEach(async () => {
  await Promise.all(runners.splice(0).map((r) => r.dispose()));
  journals.splice(0).forEach((j) => j.close());
});

it('retains terminal snapshots/events and capabilities across reopen without executing code', async () => {
  const dir = fresh(),
    a = open(dir);
  const first = engine(a);
  const created = first.runner.start('lab-99', { input: { text: 'hello' } }, { ownerId: 'dev:alice' });
  await first.runner.waitFor(created.runId);
  const snapshot = first.runner.get(created.runId);
  const token = first.runner.recoverToken(created.runId),
    events = [...first.runner.events(created.runId)];
  const rows = JSON.stringify(sql(dir, 'SELECT * FROM executions'));
  for (const value of [created.runToken, token, SECRET]) expect(rows).not.toContain(value);
  await first.runner.dispose();
  const second = engine(open(dir));
  expect(second.runner.get(created.runId)).toEqual(snapshot);
  expect(second.runner.events(created.runId)).toEqual(events);
  expect(second.run).not.toHaveBeenCalled();
  expect(() => second.runner.authorize(created.runId, created.runToken)).not.toThrow();
  expect(() => second.runner.authorize(created.runId, token)).not.toThrow();
  expect(second.runner.recent('dev:bob', 'lab-99')).toEqual([]);
});

it('finalizes an orphan as interrupted without fabricating an approval decision', () => {
  const dir = fresh(),
    first = open(dir),
    row = initial();
  first.create(row);
  const approval = {
    type: 'approval-request' as const,
    runId: row.snapshot.runId,
    correlationId: row.snapshot.correlationId,
    seq: 0,
    timestamp: new Date().toISOString(),
    approvalId: 'pending-approval',
    toolName: 'write',
    args: { value: 1 },
    message: 'Confirm write?',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  first.append(row.snapshot.runId, approval, { ...row.snapshot, eventCount: 1, pendingApprovals: 1 });
  first.close();
  const restored = engine(open(dir));
  expect(restored.runner.get(row.snapshot.runId)).toMatchObject({ status: 'failed', pendingApprovals: 0 });
  expect(restored.runner.events(row.snapshot.runId).filter((e) => e.type === 'approval-resolved')).toEqual([]);
  expect(restored.runner.events(row.snapshot.runId).some((e) => e.type === 'error' && e.message.includes('not restarted'))).toBe(
    true,
  );
  expect(() => restored.runner.resolveApproval(row.snapshot.runId, approval.approvalId, 'approve')).toThrow('not pending');
  expect(restored.run).not.toHaveBeenCalled();
});

it('refuses a second active journal owner without changing running records', () => {
  const dir = fresh(),
    first = open(dir),
    row = initial();
  first.create(row);
  expect(() => open(dir)).toThrow('already owned');
  expect(first.load(row.snapshot.runId)?.snapshot.status).toBe('running');
});

it('rejects altered owner metadata, changed events, missing events and wrong keys', async () => {
  for (const mutation of [
    "UPDATE executions SET owner_id = 'dev:bob'",
    "UPDATE execution_events SET json = '{}' WHERE seq = 0",
    'DELETE FROM execution_events WHERE seq = 0',
    null,
  ]) {
    const dir = fresh(),
      journal = open(dir),
      { runner } = engine(journal);
    const created = runner.start('lab-99', { input: { text: 'hello' } }, { ownerId: 'dev:alice' });
    await runner.waitFor(created.runId);
    await runner.dispose();
    if (mutation) sql(dir, mutation);
    expect(() => open(dir, mutation ? {} : { secret: 'other-test-journal-key-with-at-least-32-characters' })).toThrow(
      'Run journal',
    );
  }
});

it('rolls back a failed event transaction and preserves prior records', () => {
  const dir = fresh(),
    journal = open(dir),
    row = initial();
  journal.create(row);
  sql(dir, "CREATE TRIGGER reject_event BEFORE INSERT ON execution_events BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  const event = {
    type: 'log' as const,
    runId: row.snapshot.runId,
    correlationId: row.snapshot.correlationId,
    seq: 0,
    timestamp: new Date().toISOString(),
    level: 'info' as const,
    message: 'hello',
  };
  expect(() => journal.append(row.snapshot.runId, event, { ...row.snapshot, eventCount: 1 })).toThrow('Run journal');
  expect(
    JSON.parse(String((sql(dir, 'SELECT snapshot_json FROM executions')[0] as { snapshot_json: string }).snapshot_json))
      .eventCount,
  ).toBe(0);
  expect(sql(dir, 'SELECT * FROM execution_events')).toHaveLength(0);
});

it('refuses migration drift and newer schemas', () => {
  for (const change of ["UPDATE run_journal_migrations SET checksum = 'changed'", 'PRAGMA user_version = 2']) {
    const dir = fresh(),
      journal = open(dir);
    journal.close();
    sql(dir, change);
    expect(() => open(dir)).toThrow('Run journal');
  }
});

it('enforces retention, admission capacity and per-run bytes without evicting active work', async () => {
  let now = Date.now();
  const dir = fresh(),
    journal = open(dir, { maxRuns: 2, perOwner: 2, now: () => now, retentionMs: 1000 });
  const { runner } = engine(journal);
  const a = runner.start('lab-99', { input: { text: 'a' } }, { ownerId: 'dev:alice' });
  await runner.waitFor(a.runId);
  const b = runner.start('lab-99', { input: { text: 'b' } }, { ownerId: 'dev:alice' });
  await runner.waitFor(b.runId);
  const c = runner.start('lab-99', { input: { text: 'c' } }, { ownerId: 'dev:alice' });
  await runner.waitFor(c.runId);
  expect(journal.load(a.runId)).toBeUndefined();
  expect(journal.list('dev:alice', 'lab-99')).toHaveLength(2);
  now += 2000;
  expect(journal.prune(now)).toHaveLength(2);
  const row = initial();
  journal.create(row);
  const another = initial();
  journal.create(another);
  expect(() => journal.create(initial())).toThrow('Active executions');
  expect(journal.load(row.snapshot.runId)).toBeDefined();
  const small = open(fresh(), { maxEventBytes: 100 });
  const single = initial();
  small.create(single);
  const big = {
    type: 'log' as const,
    runId: single.snapshot.runId,
    correlationId: single.snapshot.correlationId,
    seq: 0,
    timestamp: new Date().toISOString(),
    level: 'info' as const,
    message: 'x'.repeat(200),
  };
  expect(() => small.append(single.snapshot.runId, big, { ...single.snapshot, eventCount: 1 })).toThrow('capacity');
  expect(small.load(single.snapshot.runId)?.snapshot.eventCount).toBe(0);
});
