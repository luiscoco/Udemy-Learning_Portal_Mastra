import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { fileUrl, openMemory, type OpenedMemory } from '@mlp/mastra-runtime';

export interface ProgressRow {
  labId: string;
  lessonRead: boolean;
  runSucceeded: boolean;
  checksPassed: boolean;
  quizBest: number | null;
  updatedAt: string;
}
export interface DocumentRow {
  docId: string;
  name: string;
  sha256: string;
  chars: number;
  text: string;
  ingestedAt: string;
}
export interface RunRow {
  runId: string;
  labId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
}

/** Row counts per durable data kind; the backup manifest and restart checks compare these. */
export interface Counts {
  progress: number;
  documents: number;
  runs: number;
  threads: number;
  messages: number;
}

const MAX_TEXT = 20_000;

/**
 * One libSQL file holding the app tables (app_*) and Mastra memory (mastra_*), so a single snapshot backs up
 * progress, documents, runs and threads together. App-level adapter: Mastra provides the storage, not app migrations.
 */
export class DurableStore {
  private constructor(
    readonly file: string,
    readonly client: Client,
    readonly mem: OpenedMemory,
  ) {}

  static async open(file: string): Promise<DurableStore> {
    mkdirSync(dirname(file), { recursive: true });
    const client = createClient({ url: fileUrl(file) });
    try {
      await client.execute('PRAGMA journal_mode = WAL');
      await client.execute('PRAGMA busy_timeout = 5000');
      await client.execute('PRAGMA foreign_keys = ON');
      const mem = await openMemory(file, { lastMessages: 20 });
      return new DurableStore(file, client, mem);
    } catch (e) {
      client.close();
      throw e;
    }
  }

  async close(): Promise<void> {
    await this.mem.close();
    this.client.close();
  }

  async hasColumn(table: string, column: string): Promise<boolean> {
    const rs = await this.client.execute(`PRAGMA table_info(${table})`);
    return rs.rows.some((r) => r.name === column);
  }

  async tables(): Promise<string[]> {
    const rs = await this.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'app_%' ORDER BY name",
    );
    return rs.rows.map((r) => String(r.name));
  }

  // ---- progress
  async upsertProgress(owner: string, p: Omit<ProgressRow, 'updatedAt' | 'quizBest'> & { quizBest?: number }, now = new Date()) {
    const quiz = await this.hasColumn('app_progress', 'quiz_best');
    await this.client.execute({
      sql: quiz
        ? `INSERT INTO app_progress (owner, lab_id, lesson_read, run_succeeded, checks_passed, updated_at, quiz_best)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner, lab_id) DO UPDATE SET lesson_read = MAX(lesson_read, excluded.lesson_read),
             run_succeeded = MAX(run_succeeded, excluded.run_succeeded), checks_passed = MAX(checks_passed, excluded.checks_passed),
             quiz_best = MAX(COALESCE(quiz_best, 0), COALESCE(excluded.quiz_best, 0)), updated_at = excluded.updated_at`
        : `INSERT INTO app_progress (owner, lab_id, lesson_read, run_succeeded, checks_passed, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner, lab_id) DO UPDATE SET lesson_read = MAX(lesson_read, excluded.lesson_read),
             run_succeeded = MAX(run_succeeded, excluded.run_succeeded), checks_passed = MAX(checks_passed, excluded.checks_passed),
             updated_at = excluded.updated_at`,
      args: [
        owner,
        p.labId,
        Number(p.lessonRead),
        Number(p.runSucceeded),
        Number(p.checksPassed),
        now.toISOString(),
        ...(quiz ? [p.quizBest ?? null] : []),
      ],
    });
  }

  async progress(owner: string): Promise<ProgressRow[]> {
    const quiz = await this.hasColumn('app_progress', 'quiz_best');
    const rs = await this.client.execute({
      sql: `SELECT lab_id, lesson_read, run_succeeded, checks_passed, updated_at${quiz ? ', quiz_best' : ''} FROM app_progress WHERE owner = ? ORDER BY lab_id`,
      args: [owner],
    });
    return rs.rows.map((r) => ({
      labId: String(r.lab_id),
      lessonRead: Number(r.lesson_read) === 1,
      runSucceeded: Number(r.run_succeeded) === 1,
      checksPassed: Number(r.checks_passed) === 1,
      quizBest: r.quiz_best === undefined || r.quiz_best === null ? null : Number(r.quiz_best),
      updatedAt: String(r.updated_at),
    }));
  }

  // ---- documents (idempotent by content hash)
  async putDocument(owner: string, d: Omit<DocumentRow, 'chars'>): Promise<'new' | 'existing'> {
    const text = d.text.slice(0, MAX_TEXT);
    const rs = await this.client.execute({
      sql: `INSERT INTO app_documents (doc_id, owner, name, sha256, chars, text, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (owner, sha256) DO NOTHING`,
      args: [d.docId, owner, d.name, d.sha256, text.length, text, d.ingestedAt],
    });
    return rs.rowsAffected === 1 ? 'new' : 'existing';
  }

  async documents(owner: string): Promise<DocumentRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT doc_id, name, sha256, chars, text, ingested_at FROM app_documents WHERE owner = ? ORDER BY name',
      args: [owner],
    });
    return rs.rows.map((r) => ({
      docId: String(r.doc_id),
      name: String(r.name),
      sha256: String(r.sha256),
      chars: Number(r.chars),
      text: String(r.text),
      ingestedAt: String(r.ingested_at),
    }));
  }

  // ---- runs
  async recordRun(owner: string, r: RunRow) {
    await this.client.execute({
      sql: `INSERT INTO app_runs (run_id, owner, lab_id, status, started_at, finished_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (run_id) DO UPDATE SET status = excluded.status, finished_at = excluded.finished_at, summary = excluded.summary`,
      args: [r.runId, owner, r.labId, r.status, r.startedAt, r.finishedAt, JSON.stringify(r.summary).slice(0, 4_000)],
    });
  }

  async runs(owner: string): Promise<RunRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT run_id, lab_id, status, started_at, finished_at, summary FROM app_runs WHERE owner = ? ORDER BY started_at',
      args: [owner],
    });
    return rs.rows.map((r) => ({
      runId: String(r.run_id),
      labId: String(r.lab_id),
      status: String(r.status),
      startedAt: String(r.started_at),
      finishedAt: r.finished_at === null ? null : String(r.finished_at),
      summary: JSON.parse(String(r.summary)) as Record<string, unknown>,
    }));
  }

  async counts(): Promise<Counts> {
    return countsOf(this.client);
  }
}

/** Counts rows per data kind (of main or an ATTACHed snapshot), tolerating tables a lower schema version lacks. */
export async function countsOf(client: Client, schema: 'main' | 'snap' = 'main'): Promise<Counts> {
  const names = new Set(
    (await client.execute(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table'`)).rows.map((r) => String(r.name)),
  );
  const count = async (t: string) =>
    names.has(t) ? Number((await client.execute(`SELECT count(*) AS n FROM ${schema}.${t}`)).rows[0]?.n ?? 0) : 0;
  return {
    progress: await count('app_progress'),
    documents: await count('app_documents'),
    runs: await count('app_runs'),
    threads: await count('mastra_threads'),
    messages: await count('mastra_messages'),
  };
}
