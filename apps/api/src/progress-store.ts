import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type Transaction } from '@libsql/client';
import {
  normalizeProgress,
  ProgressEntrySchema,
  type ProgressEntry,
  type ProgressRecord,
  type ProgressSnapshot,
} from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';

/** Forward-only v1 schema. Add a new migration to change deployed tables. */
export const PROGRESS_MIGRATION = `CREATE TABLE app_progress_records (
  lab_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0),
  record_json TEXT, updated_at TEXT NOT NULL
)`;
const checksum = createHash('sha256').update(PROGRESS_MIGRATION).digest('hex');

async function migrate(tx: Transaction) {
  const version = Number((await tx.execute('PRAGMA user_version')).rows[0]?.user_version ?? 0);
  if (version > 1) throw new LabError('CONFLICT', 'Progress storage is newer than this application.');
  if (version === 0) {
    await tx.execute(PROGRESS_MIGRATION);
    await tx.execute('CREATE TABLE app_progress_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    await tx.execute({ sql: 'INSERT INTO app_progress_migrations VALUES (1, ?)', args: [checksum] });
    await tx.execute('PRAGMA user_version = 1');
  }
  const history = await tx.execute('SELECT checksum FROM app_progress_migrations WHERE version = 1');
  if (history.rows[0]?.checksum !== checksum) throw new LabError('CONFLICT', 'Progress migration checksum does not match.');
}

async function snapshot(tx: Transaction): Promise<ProgressSnapshot> {
  const rows = await tx.execute('SELECT * FROM app_progress_records ORDER BY lab_id');
  return {
    entries: rows.rows.map((row) =>
      ProgressEntrySchema.parse({
        labId: String(row.lab_id),
        revision: Number(row.revision),
        updatedAt: String(row.updated_at),
        record: row.record_json === null ? null : JSON.parse(String(row.record_json)),
      }),
    ),
  };
}

/** File paths come only from the authenticated tenant service, never from HTTP input. */
export class ProgressRepository {
  private tails = new Map<string, Promise<unknown>>();
  constructor(private readonly fileFor: (subject: string) => string) {}

  private async transaction<T>(subject: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const file = this.fileFor(subject);
    const previous = this.tails.get(file) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        mkdirSync(dirname(file), { recursive: true });
        const client = createClient({ url: pathToFileURL(file).href });
        try {
          await client.execute('PRAGMA busy_timeout = 5000');
          await client.execute('PRAGMA journal_mode = WAL');
          const tx = await client.transaction('write');
          try {
            await migrate(tx);
            const result = await work(tx);
            await tx.commit();
            return result;
          } finally {
            tx.close();
          }
        } finally {
          client.close();
        }
      });
    this.tails.set(file, operation);
    try {
      return await operation;
    } finally {
      if (this.tails.get(file) === operation) this.tails.delete(file);
    }
  }

  get(subject: string) {
    return this.transaction(subject, snapshot);
  }

  write(subject: string, labId: string, baseRevision: number, record: ProgressRecord | null): Promise<ProgressEntry> {
    return this.transaction(subject, async (tx) => {
      const current = await tx.execute({ sql: 'SELECT revision FROM app_progress_records WHERE lab_id = ?', args: [labId] });
      const revision = Number(current.rows[0]?.revision ?? 0);
      if (revision !== baseRevision)
        throw new LabError('CONFLICT', 'Progress changed on another device. Choose which version to keep.');
      const now = new Date();
      const entry: ProgressEntry = {
        labId,
        revision: revision + 1,
        record: record ? normalizeProgress(record, now) : null,
        updatedAt: now.toISOString(),
      };
      await tx.execute({
        sql: `INSERT INTO app_progress_records (lab_id, revision, record_json, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(lab_id) DO UPDATE SET revision=excluded.revision, record_json=excluded.record_json, updated_at=excluded.updated_at`,
        args: [labId, entry.revision, entry.record ? JSON.stringify(entry.record) : null, entry.updatedAt],
      });
      return entry;
    });
  }

  import(subject: string, records: ProgressRecord[]): Promise<ProgressSnapshot> {
    return this.transaction(subject, async (tx) => {
      for (const record of records) {
        const normalized = normalizeProgress(record);
        await tx.execute({
          sql: 'INSERT INTO app_progress_records (lab_id, revision, record_json, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(lab_id) DO NOTHING',
          args: [record.labId, JSON.stringify(normalized), normalized.updatedAt],
        });
      }
      return snapshot(tx);
    });
  }
}
