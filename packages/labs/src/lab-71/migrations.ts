import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';
import { LabError } from '@mlp/lab-engine';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

/**
 * Forward-only schema history of the app tables (app_*). Never edit an applied migration: add a new one.
 * Mastra's own tables (mastra_*) are created and migrated by LibSQLStore.init(), not here.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create-progress-and-runs',
    statements: [
      `CREATE TABLE app_progress (
        owner TEXT NOT NULL,
        lab_id TEXT NOT NULL,
        lesson_read INTEGER NOT NULL DEFAULT 0,
        run_succeeded INTEGER NOT NULL DEFAULT 0,
        checks_passed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner, lab_id)
      )`,
      `CREATE TABLE app_runs (
        run_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        lab_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        summary TEXT NOT NULL DEFAULT '{}'
      )`,
    ],
  },
  {
    version: 2,
    name: 'add-documents',
    statements: [
      `CREATE TABLE app_documents (
        doc_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        chars INTEGER NOT NULL,
        text TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        UNIQUE (owner, sha256)
      )`,
    ],
  },
  {
    version: 3,
    name: 'progress-quiz-best-and-run-index',
    statements: [
      'ALTER TABLE app_progress ADD COLUMN quiz_best INTEGER',
      // Backfill: a lab whose checks passed counts as a completed quiz of unknown score (0) until retaken.
      'UPDATE app_progress SET quiz_best = 0 WHERE checks_passed = 1 AND quiz_best IS NULL',
      'CREATE INDEX app_runs_owner_lab_finished ON app_runs (owner, lab_id, finished_at)',
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS.at(-1)!.version;

export const checksumOf = (m: Migration) =>
  createHash('sha256')
    .update(`${m.version}:${m.name}\n${m.statements.join(';\n')}`, 'utf8')
    .digest('hex');

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: { version: number; name: string; ms: number }[];
  /** Set when an injected or real failure rolled a migration back. */
  failed?: { version: number; name: string; message: string };
}

const HISTORY = `CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export async function appliedMigrations(client: Client): Promise<AppliedMigration[]> {
  await client.execute(HISTORY);
  const rs = await client.execute('SELECT version, name, checksum, applied_at FROM app_schema_migrations ORDER BY version');
  return rs.rows.map((r) => ({
    version: Number(r.version),
    name: String(r.name),
    checksum: String(r.checksum),
    appliedAt: String(r.applied_at),
  }));
}

/** PRAGMA user_version of the main database, or of an ATTACHed one (`schema` is a fixed identifier, never input). */
export async function schemaVersion(client: Client, schema: 'main' | 'snap' = 'main'): Promise<number> {
  return Number((await client.execute(`PRAGMA ${schema}.user_version`)).rows[0]?.user_version ?? 0);
}

/**
 * Applies pending migrations up to `target`, each in its own write transaction (DDL, data, history row and
 * PRAGMA user_version commit together or not at all). Refuses checksum drift and databases newer than this code.
 * `failAfterFirstStatementOf` injects a failure part-way through that migration, to prove the rollback.
 */
export async function migrate(
  client: Client,
  opts: { target?: number; failAfterFirstStatementOf?: number; migrations?: Migration[]; now?: () => Date } = {},
): Promise<MigrationReport> {
  const migrations = opts.migrations ?? MIGRATIONS;
  const latest = migrations.at(-1)?.version ?? 0;
  const target = opts.target ?? latest;
  if (target < 0 || target > latest)
    throw new LabError('VALIDATION_FAILED', `Target version ${target} does not exist (latest is ${latest}).`);
  const applied = await appliedMigrations(client);
  const from = applied.at(-1)?.version ?? 0;
  if (from > latest)
    throw new LabError(
      'CONFLICT',
      `The database is at schema version ${from}, newer than this code (${latest}). Deploy the newer code instead of downgrading.`,
    );
  for (const a of applied) {
    const m = migrations.find((x) => x.version === a.version);
    if (!m || checksumOf(m) !== a.checksum)
      throw new LabError(
        'CONFLICT',
        `Migration ${a.version} (${a.name}) changed after it was applied. Add a new migration instead of editing an old one.`,
      );
  }
  if (target < from)
    throw new LabError(
      'CONFLICT',
      `The database is at version ${from}; migrations are forward-only, so ${target} cannot be reached.`,
    );

  const report: MigrationReport = { from, to: from, applied: [] };
  for (const m of migrations.filter((x) => x.version > from && x.version <= target)) {
    const started = Date.now();
    const tx = await client.transaction('write');
    try {
      for (const [i, sql] of m.statements.entries()) {
        await tx.execute(sql);
        if (i === 0 && opts.failAfterFirstStatementOf === m.version)
          throw new Error(`Injected failure after the first statement of migration ${m.version}`);
      }
      await tx.execute({
        sql: 'INSERT INTO app_schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        args: [m.version, m.name, checksumOf(m), (opts.now?.() ?? new Date()).toISOString()],
      });
      await tx.execute(`PRAGMA user_version = ${m.version}`);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      report.failed = { version: m.version, name: m.name, message: e instanceof Error ? e.message : String(e) };
      return report;
    } finally {
      tx.close();
    }
    report.applied.push({ version: m.version, name: m.name, ms: Date.now() - started });
    report.to = m.version;
  }
  return report;
}
