/**
 * Real-restart check for L71, run as separate Node processes (see lab71.restart.test.ts):
 *   restart-worker.ts <dir> write    → migrate, write progress/document/run/thread, back up, exit
 *   restart-worker.ts <dir> read     → a NEW process reads everything back and verifies the backup
 *   restart-worker.ts <dir> mutate   → adds a progress row written after the backup
 *   restart-worker.ts <dir> restore  → restores the backup over the database before opening it, then reads it
 * Prints one JSON line on stdout. Offline: no model or provider is called.
 */
import { join } from 'node:path';
import { backup, listBackups, restore, verifyBackup } from './backup.js';
import { migrate, schemaVersion } from './migrations.js';
import { DurableStore } from './store.js';

const [dir, phase] = process.argv.slice(2);
if (!dir || !['write', 'read', 'mutate', 'restore'].includes(phase ?? '')) {
  console.error('usage: restart-worker.ts <dir> write|read|mutate|restore');
  process.exit(2);
}
const file = join(dir, 'durable.db');
const backups = join(dir, 'backups');
const owner = 'learner-hash';

const thread = { threadId: 't1', resourceId: 'learner' };
const textOf = (m: { content: unknown }) =>
  ((m.content as { parts?: { type: string; text?: string }[] }).parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');

async function snapshot(s: DurableStore) {
  return {
    version: await schemaVersion(s.client),
    counts: await s.counts(),
    progress: (await s.progress(owner)).map((p) => `${p.labId}:${p.quizBest}`),
    documents: (await s.documents(owner)).map((d) => d.name),
    runs: (await s.runs(owner)).map((r) => r.runId),
    messages: (await s.mem.memory.recall({ ...thread, perPage: false })).messages.map((m) => `${m.role}:${textOf(m as never)}`),
  };
}

if (phase === 'restore') {
  const [latest] = listBackups(backups);
  await restore(backups, latest!, file); // nothing in this process has opened the file yet
}
const s = await DurableStore.open(file);
try {
  if (phase === 'write') {
    const migration = await migrate(s.client);
    await s.upsertProgress(owner, { labId: 'lab-70', lessonRead: true, runSucceeded: true, checksPassed: true, quizBest: 4 });
    await s.putDocument(owner, {
      docId: 'd1',
      name: 'refund-policy.md',
      sha256: 'a'.repeat(64),
      text: 'Refunds take 5 days.',
      ingestedAt: '2026-01-01T00:00:00.000Z',
    });
    await s.recordRun(owner, {
      runId: 'run-1',
      labId: 'lab-70',
      status: 'succeeded',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      summary: {},
    });
    await s.mem.memory.createThread({ ...thread, title: 'notes' });
    await s.mem.memory.saveMessages({
      messages: [
        {
          id: 'm1',
          ...thread,
          role: 'user',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          content: { format: 2, parts: [{ type: 'text', text: 'Backup window is 02:00 UTC.' }] },
        },
        {
          id: 'm2',
          ...thread,
          role: 'assistant',
          createdAt: new Date('2026-01-01T00:00:01Z'),
          content: { format: 2, parts: [{ type: 'text', text: 'Noted.' }] },
        },
      ] as never,
    });
    const b = await backup(s.client, backups, { keep: 3 });
    console.log(
      JSON.stringify({
        pid: process.pid,
        phase,
        applied: migration.applied.map((a) => a.version),
        backup: b.manifest.file,
        ...(await snapshot(s)),
      }),
    );
  } else if (phase === 'mutate') {
    await s.upsertProgress(owner, { labId: 'lab-71', lessonRead: true, runSucceeded: false, checksPassed: false });
    console.log(JSON.stringify({ pid: process.pid, phase, ...(await snapshot(s)) }));
  } else {
    const verified = await verifyBackup(backups, listBackups(backups)[0]!);
    console.log(
      JSON.stringify({
        pid: process.pid,
        phase,
        applied: (await migrate(s.client)).applied.length,
        verified: verified.ok,
        ...(await snapshot(s)),
      }),
    );
  }
} finally {
  await s.close();
}
