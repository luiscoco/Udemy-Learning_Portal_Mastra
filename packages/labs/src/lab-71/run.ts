import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation, type RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { courseLibrary, listLibrary } from '../lab-36/library.js';
import { textOf } from '../lab-67/transcript.js';
import { sampleDocuments } from '../lab-70/knowledge.js';
import { backup, inspect, listBackups, restore, verifyBackup, type Manifest } from './backup.js';
import { LATEST_VERSION, migrate, schemaVersion, type MigrationReport } from './migrations.js';
import { sweep, DEFAULT_RETENTION, KEPT_UNTIL_DELETED, type RetentionPolicy, type SweepReport } from './retention.js';
import { DurableStore, type Counts } from './store.js';
import { lab71Definition } from './definition.js';

const STORE = 'lab-71-durable';
const THREAD = 'durable-1';
const RESOURCE = 'learner';
const lock = new KeyedLock();

export const Lab71InputSchema = z.object({
  store: z.enum(['fresh', 'durable']),
  targetVersion: z.coerce.number().int().min(1).max(LATEST_VERSION),
  failMigration: z.boolean().default(false),
  note: z.string().trim().min(1).max(500),
  retentionDays: z.coerce.number().int().min(1).max(365),
  backupsKeep: z.coerce.number().int().min(1).max(30),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab71Input = z.infer<typeof Lab71InputSchema>;

export interface Lab71Output {
  store: Lab71Input['store'];
  file: string;
  migration: MigrationReport & {
    refused?: string;
    versionAfter: number;
    /** After an injected failure: the version and app tables right after the rollback, before the retry. */
    rollback?: { version: number; quizColumn: boolean; retried: boolean };
  };
  written: {
    progress: number;
    document: 'new' | 'existing' | 'skipped';
    documentName?: string;
    run: boolean;
    threadMessages: number;
  };
  restart: { before: Counts; after: Counts; recalled: string[] };
  backup: { manifest: Manifest; rotated: number; kept: number } | null;
  restoreDrill: { ok: boolean; problems: string[]; counts?: Counts; liveUnchanged: boolean } | null;
  corruption: { detected: boolean; problems: string[] } | null;
  retention:
    | (SweepReport & {
        policy: RetentionPolicy;
        demoRunsInserted: number;
        currentRunKept: boolean;
        keptUntilDeleted: readonly string[];
      })
    | null;
}

/** Offline stand-in for the thread turn: acknowledges the note and says how many notes it can see. */
export function noteScript() {
  return (v: PromptView): ScriptedTurn => ({
    text: `Noted: "${v.lastUser.slice(0, 200)}". I can see ${v.userMessages.length} note(s) in this durable thread.`,
  });
}

const sameCounts = (a: Counts, b: Counts) => (Object.keys(a) as (keyof Counts)[]).every((k) => a[k] === b[k]);

export const lab71: LabImplementation<Lab71Input, Lab71Output, LabServices> = {
  definition: lab71Definition as LabDefinition,
  inputSchema: Lab71InputSchema,
  run(ctx, input) {
    // One run at a time per learner on the durable file; fresh runs use their own scratch file.
    const key = input.store === 'durable' ? ctx.services.tenant.partition : ctx.runId;
    return lock.run(key, () => runPhases(ctx, input), ctx.signal);
  },

  validate(out, input) {
    const m = out.migration;
    return summarizeChecks([
      {
        id: 'migrations-applied',
        label: 'The schema reached the target version through recorded migrations',
        passed: !m.refused && m.versionAfter === input.targetVersion,
        message:
          m.refused ??
          `v${m.from} → v${m.versionAfter}; applied ${m.applied.map((a) => a.version).join(', ') || 'none (already current)'}`,
      },
      {
        id: 'rollback-proven',
        label: 'A failing migration rolled back completely',
        passed:
          !input.failMigration ||
          (out.migration.rollback !== undefined && !out.migration.rollback.quizColumn && out.migration.rollback.version < 3),
        message: !input.failMigration
          ? 'no failure injected (turn on "Fail migration 3" to see the rollback)'
          : m.rollback
            ? `after the failure: v${m.rollback.version}, quiz_best column ${m.rollback.quizColumn ? 'present (partial!)' : 'absent'}`
            : 'migration 3 did not run, so nothing was injected (start from an empty database)',
      },
      {
        id: 'data-survives-restart',
        label: 'Progress, documents, runs and the thread survived closing and reopening the database',
        passed: sameCounts(out.restart.before, out.restart.after) && out.restart.recalled.includes(input.note),
        message: `before ${JSON.stringify(out.restart.before)}, after ${JSON.stringify(out.restart.after)}`,
      },
      {
        id: 'backup-verified',
        label: 'The backup snapshot matches its manifest',
        passed: out.backup !== null && out.restoreDrill !== null && out.restoreDrill.problems.length === 0,
        message: out.backup
          ? `${out.backup.manifest.file}: ${out.backup.manifest.bytes} bytes, v${out.backup.manifest.schemaVersion}`
          : 'no backup',
      },
      {
        id: 'restore-drill',
        label: 'The restore drill reproduced the backup without touching the live database',
        passed: out.restoreDrill?.ok === true && out.restoreDrill.liveUnchanged,
        message: out.restoreDrill ? `drill counts ${JSON.stringify(out.restoreDrill.counts)}` : 'not run',
      },
      {
        id: 'corruption-refused',
        label: 'A corrupted backup is detected and refused',
        passed: out.corruption?.detected === true,
        message: out.corruption?.problems.join('; ') || 'not run',
      },
      {
        id: 'retention-swept',
        label: 'Expired runs were deleted; the current run and learner data were kept',
        passed:
          out.retention !== null && out.retention.expiredByAge >= out.retention.demoRunsInserted && out.retention.currentRunKept,
        message: out.retention
          ? `${out.retention.expiredByAge} expired by age, ${out.retention.expiredByCap} beyond the cap, ${out.retention.remaining} kept`
          : 'not run',
      },
    ]);
  },
};

async function runPhases(ctx: RunContext<LabServices>, input: Lab71Input): Promise<Lab71Output> {
  const s = ctx.services;
  const scratch = join(s.files('lab-71'), ctx.runId);
  const fresh = input.store === 'fresh';
  const dbFile = fresh ? join(scratch, 'fresh.db') : s.memory.file(STORE);
  const backupDir = fresh ? join(scratch, 'backups') : s.files('lab-71-backups');
  const drillFile = join(scratch, 'drill.db');
  const owner = s.tenant.partition; // a hash, never the raw identity (L62)
  const step = (stepId: string, status: 'running' | 'success' | 'failed', output?: unknown) =>
    ctx.emit({ type: 'workflow-step', stepId, status, ...(output === undefined ? {} : { output }) });
  const startedAt = new Date().toISOString();

  mkdirSync(scratch, { recursive: true });
  let store: DurableStore | undefined = await DurableStore.open(dbFile);
  try {
    // 1. Migrate
    step('migrate', 'running');
    let migration: Lab71Output['migration'];
    try {
      const first = await migrate(store.client, {
        target: input.targetVersion,
        failAfterFirstStatementOf: input.failMigration ? 3 : undefined,
      });
      let rollback: Lab71Output['migration']['rollback'];
      let report = first;
      if (first.failed) {
        rollback = {
          version: await schemaVersion(store.client),
          quizColumn: await store.hasColumn('app_progress', 'quiz_best'),
          retried: true,
        };
        ctx.log(
          'warn',
          `Migration ${first.failed.version} failed and rolled back: ${first.failed.message}. Retrying without the fault.`,
        );
        const retry = await migrate(store.client, { target: input.targetVersion });
        report = { ...retry, from: first.from, applied: [...first.applied, ...retry.applied], failed: first.failed };
      }
      migration = { ...report, versionAfter: await schemaVersion(store.client), ...(rollback ? { rollback } : {}) };
      step('migrate', 'success', { from: migration.from, to: migration.versionAfter });
    } catch (e) {
      if (!(e instanceof LabError)) throw e;
      migration = {
        from: await schemaVersion(store.client),
        to: await schemaVersion(store.client),
        applied: [],
        refused: e.message,
        versionAfter: await schemaVersion(store.client),
      };
      ctx.log('warn', `Migration refused: ${e.message}`);
      step('migrate', 'failed', { refused: e.message });
    }
    ctx.throwIfAborted();

    // 2. Write progress, a document, this run and a thread turn
    step('write', 'running');
    const version = migration.versionAfter;
    await store.upsertProgress(owner, {
      labId: 'lab-71',
      lessonRead: true,
      runSucceeded: false,
      checksPassed: false,
      quizBest: 3,
    });
    await store.upsertProgress(owner, { labId: 'lab-70', lessonRead: true, runSucceeded: true, checksPassed: true });
    let document: Lab71Output['written']['document'] = 'skipped';
    let documentName: string | undefined;
    if (version >= 2) {
      const own = listLibrary(courseLibrary(s), 1)[0]; // the learner's own library first (L36/L70)
      const d = own ?? sampleDocuments()[0]!;
      document = await store.putDocument(owner, {
        docId: d.docId,
        name: d.name,
        sha256: d.sha256,
        text: d.text,
        ingestedAt: d.ingestedAt,
      });
      documentName = d.name;
    } else ctx.log('info', 'Schema v1 has no documents table: the document write is skipped.');
    await store.recordRun(owner, {
      runId: ctx.runId,
      labId: 'lab-71',
      status: 'running',
      startedAt,
      finishedAt: null,
      summary: { store: input.store },
    });
    const resolved = s.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: noteScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'lab71-notes',
        name: 'Notes assistant',
        instructions: 'You keep operational notes. Acknowledge the note in one short sentence.',
        model: resolved.model as never,
        memory: store.mem.memory,
      }),
    );
    await agent.generate(input.note, { memory: { thread: THREAD, resource: RESOURCE }, abortSignal: ctx.signal });
    const before = await store.counts();
    step('write', 'success', before);

    // 3. Restart: close every client, then reopen the same file with new objects
    step('restart', 'running');
    await store.close();
    store = undefined;
    ctx.log('info', 'Closed the app client and the Mastra store; reopening the file with new objects.');
    store = await DurableStore.open(dbFile);
    const after = await store.counts();
    const recalled = (await store.mem.memory.recall({ threadId: THREAD, resourceId: RESOURCE, perPage: false })).messages
      .filter((m) => m.role === 'user')
      .map((m) => textOf(m as never));
    step('restart', 'success', after);
    ctx.throwIfAborted();

    // 4. Backup
    step('backup', 'running');
    const b = await backup(store.client, backupDir, { keep: input.backupsKeep });
    step('backup', 'success', { file: b.manifest.file, bytes: b.manifest.bytes });

    // 5. Restore drill (into a separate file) and a corruption check
    step('restore-drill', 'running');
    const liveBefore = await store.counts();
    const verification = await verifyBackup(backupDir, b.manifest.file);
    let drillCounts: Counts | undefined;
    let drillOk = false;
    if (verification.ok) {
      await restore(backupDir, b.manifest.file, drillFile);
      const drill = await inspect(drillFile); // attach and detach: the drill file is not left open
      drillCounts = drill.counts;
      drillOk =
        drill.integrity === 'ok' &&
        sameCounts(drill.counts, b.manifest.counts) &&
        drill.schemaVersion === b.manifest.schemaVersion;
    }
    const liveUnchanged = sameCounts(liveBefore, await store.counts());
    const corruptDir = join(scratch, 'corrupt');
    const corruptName = b.manifest.file;
    copyBackup(backupDir, corruptDir, corruptName);
    const bytes = readFileSync(join(corruptDir, corruptName));
    const mid = Math.floor(bytes.length / 2);
    bytes[mid] = bytes[mid]! ^ 0xff;
    writeFileSync(join(corruptDir, corruptName), bytes);
    const corrupt = await verifyBackup(corruptDir, corruptName);
    let refused = false;
    try {
      await restore(corruptDir, corruptName, join(scratch, 'never.db'));
    } catch (e) {
      refused = e instanceof LabError && e.code === 'CONFLICT';
    }
    step('restore-drill', drillOk && liveUnchanged ? 'success' : 'failed', {
      drillOk,
      liveUnchanged,
      corruptionRefused: refused,
    });

    // 6. Retention: insert demo runs older than the policy, sweep, and keep this run
    step('retention', 'running');
    const policy: RetentionPolicy = { ...DEFAULT_RETENTION, runDays: input.retentionDays, backupsKeep: input.backupsKeep };
    const old = new Date(Date.now() - (input.retentionDays + 1) * 86_400_000).toISOString();
    for (let i = 1; i <= 3; i++)
      await store.recordRun(owner, {
        runId: `${ctx.runId}-expired-${i}`,
        labId: 'lab-71-demo',
        status: 'succeeded',
        startedAt: old,
        finishedAt: old,
        summary: { demo: true },
      });
    await store.recordRun(owner, {
      runId: ctx.runId,
      labId: 'lab-71',
      status: 'succeeded',
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: { store: input.store, version },
    });
    const swept = await sweep(store.client, policy);
    const currentRunKept = (await store.runs(owner)).some((r) => r.runId === ctx.runId);
    step('retention', 'success', swept);

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, storage: 'libsql (local file, WAL)' },
    });
    return {
      store: input.store,
      file: fresh ? 'scratch database (deleted after the run)' : `.data/memory/tenants/${s.tenant.partition}/${STORE}.db`,
      migration,
      written: { progress: 2, document, ...(documentName ? { documentName } : {}), run: true, threadMessages: before.messages },
      restart: { before, after, recalled },
      backup: { manifest: b.manifest, rotated: b.rotated.length, kept: listBackups(backupDir).length },
      restoreDrill: {
        ok: drillOk,
        problems: verification.problems,
        ...(drillCounts ? { counts: drillCounts } : {}),
        liveUnchanged,
      },
      corruption: { detected: !corrupt.ok && refused, problems: corrupt.problems },
      retention: { ...swept, policy, demoRunsInserted: 3, currentRunKept, keptUntilDeleted: KEPT_UNTIL_DELETED },
    };
  } finally {
    await store?.close();
    cleanScratch(s.files('lab-71'), scratch);
  }
}

/**
 * Best-effort cleanup of scratch folders. On Windows a libSQL file stays locked after close() until the process
 * exits, so this run's folder may survive; stale folders from earlier runs are removed on later runs.
 */
function cleanScratch(root: string, mine: string) {
  const tryRm = (dir: string) => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // still locked by this process: a later run removes it
    }
  };
  tryRm(mine);
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (dir !== mine && Date.now() - statSync(dir).mtimeMs > 10 * 60_000) tryRm(dir);
  }
}

function copyBackup(from: string, to: string, file: string) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of [file, `${file}.json`]) copyFileSync(join(from, f), join(to, f));
}
