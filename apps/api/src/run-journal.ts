import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'libsql';
import { z } from 'zod';
import { ExecutionEventSchema, RunSnapshotSchema, type ExecutionEvent, type RunSnapshot } from '@mlp/contracts';
import { LabError, type PersistedRun, type RunPersistence } from '@mlp/lab-engine';

export const RUN_JOURNAL_MIGRATION = [
  `CREATE TABLE executions (
    run_id TEXT PRIMARY KEY, owner_id TEXT, hashes_json TEXT NOT NULL,
    snapshot_json TEXT NOT NULL, event_bytes INTEGER NOT NULL, tip TEXT NOT NULL, tag TEXT NOT NULL
  )`,
  `CREATE TABLE execution_events (
    run_id TEXT NOT NULL REFERENCES executions(run_id) ON DELETE CASCADE,
    seq INTEGER NOT NULL, json TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(run_id, seq)
  )`,
  'CREATE INDEX executions_owner ON executions(owner_id)',
] as const;
const CHECKSUM = createHash('sha256').update(JSON.stringify(RUN_JOURNAL_MIGRATION)).digest('hex');
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const Hashes = z.array(HASH).min(1).max(5);
const StoredMeta = z.object({
  run_id: z.string().uuid(),
  owner_id: z.string().min(1).max(120).nullable(),
  hashes_json: z.string().max(400),
  snapshot_json: z.string().max(4096),
  event_bytes: z
    .number()
    .int()
    .nonnegative()
    .max(8 * 1024 * 1024 + 16384),
  tip: HASH,
  tag: HASH,
});
type Meta = z.infer<typeof StoredMeta> & { snapshot: RunSnapshot; tokenHashes: string[] };
const unavailable = () =>
  new LabError('NOT_CONFIGURED', 'Run journal is unavailable, incompatible or already owned by another runner.');
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const INTERRUPTED =
  'Execution interrupted by an API restart. Actions may already have occurred. The run was not restarted; verify before starting again.';

/** Single active local runner. Synchronous transactions commit before engine execution/broadcast. */
export class SqliteRunJournal implements RunPersistence {
  readonly #secret: string;
  readonly #file: string;
  readonly #now: () => number;
  readonly #maxRuns: number;
  readonly #perOwner: number;
  readonly #retention: number;
  readonly #maxBytes: number;
  #db: Database.Database | null = null;
  #lock: Database.Database | null = null;
  #closed = false;
  #failed = false;

  constructor(
    root: string,
    options: {
      secret: string;
      now?: () => number;
      maxRuns?: number;
      perOwner?: number;
      retentionMs?: number;
      maxEventBytes?: number;
    },
  ) {
    if (options.secret.length < 32) throw new Error('RUN_STORE_SECRET must have at least 32 characters');
    this.#secret = options.secret;
    this.#now = options.now ?? Date.now;
    this.#maxRuns = options.maxRuns ?? 100;
    this.#perOwner = options.perOwner ?? 20;
    this.#retention = options.retentionMs ?? 24 * 3600_000;
    this.#maxBytes = options.maxEventBytes ?? 8 * 1024 * 1024;
    if (
      ![this.#maxRuns, this.#perOwner, this.#retention, this.#maxBytes].every((v) => Number.isSafeInteger(v) && v > 0) ||
      this.#maxRuns > 100 ||
      this.#perOwner > 20 ||
      this.#maxBytes > 8 * 1024 * 1024
    )
      throw new Error('Invalid run journal limits');
    const directory = resolve(root, 'runs');
    this.#file = join(directory, 'executions.db');
    try {
      mkdirSync(directory, { recursive: true });
      this.#lock = new Database(join(directory, 'runner-lock.db'), { timeout: 0 });
      this.#lock.exec('CREATE TABLE IF NOT EXISTS runner_lock (id INTEGER); BEGIN EXCLUSIVE');
      this.#db = new Database(this.#file, { timeout: 2000 });
      this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON');
      this.#db.transaction(() => {
        const version = Number((this.#db!.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
        if (version > 1) throw unavailable();
        if (version === 0) {
          for (const statement of RUN_JOURNAL_MIGRATION) this.#db!.exec(statement);
          this.#db!.exec('CREATE TABLE run_journal_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
          this.#db!.prepare('INSERT INTO run_journal_migrations VALUES (1, ?)').run(CHECKSUM);
          this.#db!.exec('PRAGMA user_version = 1');
        }
      })();
      this.assertHealthy();
      this.#db.transaction(() => {
        for (const meta of this.all()) {
          this.readEvents(meta); // Validate before either serving or changing previously stored state.
          if (meta.snapshot.status !== 'running') continue;
          const timestamp = new Date(this.#now()).toISOString();
          const error: ExecutionEvent = {
            type: 'error',
            code: 'INTERNAL',
            message: INTERRUPTED,
            retryable: false,
            runId: meta.run_id,
            correlationId: meta.snapshot.correlationId,
            seq: meta.snapshot.eventCount,
            timestamp,
          };
          const withError = { ...meta.snapshot, eventCount: meta.snapshot.eventCount + 1 };
          this.appendInside(meta, error, withError);
          const complete: ExecutionEvent = {
            type: 'complete',
            status: 'failed',
            durationMs: Math.max(0, this.#now() - Date.parse(meta.snapshot.startedAt)),
            runId: meta.run_id,
            correlationId: meta.snapshot.correlationId,
            seq: withError.eventCount,
            timestamp,
          };
          this.appendInside(this.meta(meta.run_id)!, complete, {
            ...withError,
            status: 'failed',
            finishedAt: timestamp,
            pendingApprovals: 0,
            eventCount: withError.eventCount + 1,
          });
        }
      })();
      this.prune(this.#now());
    } catch {
      this.close();
      throw unavailable();
    }
  }

  private mac(value: unknown): string {
    return createHmac('sha256', this.#secret).update(JSON.stringify(value)).digest('hex');
  }
  private seal(meta: Omit<z.infer<typeof StoredMeta>, 'tag'>): string {
    return this.mac([
      'run-meta-v1',
      meta.run_id,
      meta.owner_id,
      meta.hashes_json,
      meta.snapshot_json,
      meta.event_bytes,
      meta.tip,
    ]);
  }
  assertHealthy(): void {
    if (this.#closed || this.#failed || !this.#db || !existsSync(this.#file)) throw unavailable();
    try {
      const version = (this.#db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      const history = this.#db.prepare('SELECT checksum FROM run_journal_migrations WHERE version = 1').get() as
        { checksum: string } | undefined;
      if (version !== 1 || history?.checksum !== CHECKSUM) throw unavailable();
    } catch {
      this.#failed = true;
      throw unavailable();
    }
  }
  private guard<T>(work: () => T): T {
    try {
      this.assertHealthy();
      return work();
    } catch (error) {
      if (error instanceof LabError && ['TOO_MANY_REQUESTS', 'VALIDATION_FAILED'].includes(error.code)) throw error;
      this.#failed = true;
      throw unavailable();
    }
  }
  private decode(row: unknown): Meta {
    const parsed = StoredMeta.parse(row);
    if (!equal(parsed.tag, this.seal(parsed))) throw unavailable();
    const snapshot = RunSnapshotSchema.parse(JSON.parse(parsed.snapshot_json));
    const tokenHashes = Hashes.parse(JSON.parse(parsed.hashes_json));
    if (
      snapshot.runId !== parsed.run_id ||
      snapshot.eventCount > 5008 ||
      (snapshot.status !== 'running' && (!snapshot.finishedAt || snapshot.pendingApprovals !== 0))
    )
      throw unavailable();
    return { ...parsed, snapshot, tokenHashes };
  }
  private meta(id: string): Meta | undefined {
    const row = this.#db!.prepare('SELECT * FROM executions WHERE run_id = ?').get(id);
    return row ? this.decode(row) : undefined;
  }
  private all(): Meta[] {
    const rows = this.#db!.prepare('SELECT * FROM executions LIMIT 1001').all();
    if (rows.length > 1000) throw unavailable();
    return rows.map((r) => this.decode(r));
  }
  private readEvents(meta: Meta): ExecutionEvent[] {
    const rows = this.#db!.prepare('SELECT seq, json, tag FROM execution_events WHERE run_id = ? ORDER BY seq LIMIT 5009').all(
      meta.run_id,
    ) as { seq: number; json: string; tag: string }[];
    if (rows.length !== meta.snapshot.eventCount) throw unavailable();
    let tip = this.mac(['run-seed-v1', meta.run_id]);
    let bytes = 0;
    const events = rows.map((row, index) => {
      const event = ExecutionEventSchema.parse(JSON.parse(row.json));
      if (
        event.seq !== index ||
        row.seq !== index ||
        event.runId !== meta.run_id ||
        event.correlationId !== meta.snapshot.correlationId
      )
        throw unavailable();
      tip = this.mac(['run-event-v1', tip, row.json]);
      bytes += Buffer.byteLength(row.json);
      if (!equal(tip, row.tag)) throw unavailable();
      return event;
    });
    if (!equal(tip, meta.tip) || bytes !== meta.event_bytes) throw unavailable();
    if (meta.snapshot.status !== 'running') {
      const last = events.at(-1);
      if (last?.type !== 'complete' || last.status !== meta.snapshot.status) throw unavailable();
    }
    return events;
  }
  private update(meta: Meta) {
    const tag = this.seal(meta);
    this.#db!.prepare('UPDATE executions SET hashes_json=?, snapshot_json=?, event_bytes=?, tip=?, tag=? WHERE run_id=?').run(
      meta.hashes_json,
      meta.snapshot_json,
      meta.event_bytes,
      meta.tip,
      tag,
      meta.run_id,
    );
  }
  private appendInside(meta: Meta, event: ExecutionEvent, snapshot: RunSnapshot) {
    const parsed = ExecutionEventSchema.parse(event),
      next = RunSnapshotSchema.parse(snapshot);
    if (
      meta.snapshot.status !== 'running' ||
      parsed.seq !== meta.snapshot.eventCount ||
      parsed.runId !== meta.run_id ||
      parsed.correlationId !== meta.snapshot.correlationId ||
      next.runId !== meta.run_id ||
      next.labId !== meta.snapshot.labId ||
      next.eventCount !== parsed.seq + 1 ||
      next.startedAt !== meta.snapshot.startedAt ||
      next.mode !== meta.snapshot.mode ||
      next.correlationId !== meta.snapshot.correlationId ||
      next.deadlineMs !== meta.snapshot.deadlineMs
    )
      throw unavailable();
    const json = JSON.stringify(parsed);
    const bytes = meta.event_bytes + Buffer.byteLength(json);
    const terminalReserve = parsed.type === 'error' || parsed.type === 'complete' ? 16384 : 0;
    if (bytes > this.#maxBytes + terminalReserve || next.eventCount > 5008)
      throw new LabError('VALIDATION_FAILED', 'Execution journal event capacity reached. Verify effects before repeating.');
    const tip = this.mac(['run-event-v1', meta.tip, json]);
    this.#db!.prepare('INSERT INTO execution_events (run_id, seq, json, tag) VALUES (?, ?, ?, ?)').run(
      meta.run_id,
      parsed.seq,
      json,
      tip,
    );
    this.update({ ...meta, snapshot: next, snapshot_json: JSON.stringify(next), event_bytes: bytes, tip });
  }

  create(run: Omit<PersistedRun, 'events'>): string[] {
    return this.guard(() =>
      this.#db!.transaction(() => {
        const removed = this.pruneInside(this.#now(), { ownerId: run.ownerId });
        const snapshot = RunSnapshotSchema.parse(run.snapshot),
          hashes = Hashes.parse(run.tokenHashes);
        if (snapshot.status !== 'running' || snapshot.eventCount !== 0) throw unavailable();
        const meta = StoredMeta.omit({ tag: true }).parse({
          run_id: snapshot.runId,
          owner_id: run.ownerId,
          hashes_json: JSON.stringify(hashes),
          snapshot_json: JSON.stringify(snapshot),
          event_bytes: 0,
          tip: this.mac(['run-seed-v1', snapshot.runId]),
        });
        this.#db!.prepare('INSERT INTO executions VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          meta.run_id,
          meta.owner_id,
          meta.hashes_json,
          meta.snapshot_json,
          meta.event_bytes,
          meta.tip,
          this.seal(meta),
        );
        return removed;
      })(),
    );
  }
  append(id: string, event: ExecutionEvent, snapshot: RunSnapshot): void {
    this.guard(() =>
      this.#db!.transaction(() => {
        const meta = this.meta(id);
        if (!meta) throw unavailable();
        this.appendInside(meta, event, snapshot);
      })(),
    );
  }
  capabilities(id: string, hashes: readonly string[]): void {
    this.guard(() =>
      this.#db!.transaction(() => {
        const meta = this.meta(id);
        const validated = Hashes.parse(hashes);
        if (!meta || validated[0] !== meta.tokenHashes[0]) throw unavailable();
        this.update({ ...meta, hashes_json: JSON.stringify(validated), tokenHashes: validated });
      })(),
    );
  }
  load(id: string): PersistedRun | undefined {
    return this.guard(() => {
      const meta = this.meta(id);
      if (!meta) return undefined;
      return { ownerId: meta.owner_id, tokenHashes: meta.tokenHashes, snapshot: meta.snapshot, events: this.readEvents(meta) };
    });
  }
  list(ownerId: string, labId: string): RunSnapshot[] {
    return this.guard(() =>
      this.all()
        .filter((m) => m.owner_id === ownerId && m.snapshot.labId === labId)
        .map((m) => m.snapshot)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 10),
    );
  }
  private pruneInside(now: number, adding?: { ownerId: string | null }): string[] {
    const rows = this.all();
    const removed = new Set<string>();
    for (const meta of rows)
      if (meta.snapshot.status !== 'running' && now - Date.parse(meta.snapshot.finishedAt!) > this.#retention)
        removed.add(meta.run_id);
    const evict = (selected: Meta[], max: number) => {
      const live = selected.filter((m) => !removed.has(m.run_id));
      const terminal = live
        .filter((m) => m.snapshot.status !== 'running')
        .sort((a, b) => a.snapshot.finishedAt!.localeCompare(b.snapshot.finishedAt!));
      for (let count = live.length; count > max; count--) {
        const oldest = terminal.shift();
        if (!oldest)
          throw new LabError(
            'TOO_MANY_REQUESTS',
            'Active executions occupy the retained run capacity. Wait for them to finish.',
            { retryable: true },
          );
        removed.add(oldest.run_id);
      }
    };
    for (const owner of new Set([...rows.map((m) => m.owner_id), ...(adding ? [adding.ownerId] : [])]))
      evict(
        rows.filter((m) => m.owner_id === owner),
        this.#perOwner - Number(adding?.ownerId === owner && adding !== undefined),
      );
    evict(rows, this.#maxRuns - Number(adding !== undefined));
    for (const id of removed) this.#db!.prepare('DELETE FROM executions WHERE run_id = ?').run(id);
    return [...removed];
  }
  prune(now: number): string[] {
    return this.guard(() => this.#db!.transaction(() => this.pruneInside(now))());
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#db?.close();
    } catch {
      /* best effort after a database failure */
    }
    try {
      if (this.#lock?.inTransaction) this.#lock.exec('ROLLBACK');
    } catch {
      /* process exit also releases the lock */
    }
    try {
      this.#lock?.close();
    } catch {
      /* best effort */
    }
  }
}
