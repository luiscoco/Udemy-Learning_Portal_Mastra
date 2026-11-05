import { createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type Row, type Transaction } from '@libsql/client';
import { createSessionCookie, safeEqual, sessionIdFromCookie, type Principal, type Session } from '@mlp/auth';
import { PrincipalSchema } from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';
import type { AppConfig } from './config.js';

export type SessionCreation = { cookieValue: string; session: Session };
export interface ApiSessions {
  readonly ttlMs: number;
  create(principal: Principal, previousSid?: string): SessionCreation | Promise<SessionCreation>;
  verify(cookie: string | undefined): Session | null | Promise<Session | null>;
  revoke(sid: string): boolean | Promise<boolean>;
}

/** Immutable migration: add a later version rather than editing these statements. */
export const SESSION_MIGRATION = [
  `CREATE TABLE app_sessions (
    sid_hash TEXT PRIMARY KEY, principal_json TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    binding TEXT NOT NULL, integrity TEXT NOT NULL
  )`,
  'CREATE INDEX app_sessions_expiry ON app_sessions(expires_at)',
] as const;
const checksum = createHash('sha256').update(JSON.stringify(SESSION_MIGRATION)).digest('hex');
const tails = new Map<string, Promise<unknown>>();
const digest = (sid: string) => createHash('sha256').update(sid).digest('hex');
const unavailable = () =>
  new LabError('NOT_CONFIGURED', 'Persistent session storage is unavailable. Check its data volume and migrations.');

async function migrate(tx: Transaction) {
  const version = Number((await tx.execute('PRAGMA user_version')).rows[0]?.user_version ?? 0);
  if (version > 1) throw unavailable();
  if (version === 0) {
    for (const sql of SESSION_MIGRATION) await tx.execute(sql);
    await tx.execute('CREATE TABLE app_session_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    await tx.execute({ sql: 'INSERT INTO app_session_migrations VALUES (1, ?)', args: [checksum] });
    await tx.execute('PRAGMA user_version = 1');
  }
  const history = await tx.execute('SELECT checksum FROM app_session_migrations WHERE version = 1');
  if (history.rows[0]?.checksum !== checksum) throw unavailable();
}

const normalizedList = (value: string) =>
  [
    ...new Set(
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].sort();

/** Active credentials/policy are keyed metadata; no password digest is exposed in the database. */
export function sessionIdentityBinding(config: AppConfig): string {
  // PasswordIdentityProvider uses the last entry for a duplicate username; bind that effective map.
  const passwordUsers = new Map<string, string>();
  for (const entry of (config.AUTH_USERS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean))
    passwordUsers.set(entry.slice(0, entry.indexOf(':')), entry);
  const credentials =
    config.AUTH_PROVIDER === 'password'
      ? [...passwordUsers.values()].sort()
      : [normalizedList(config.AUTH_DEV_USERS.toLowerCase()), config.AUTH_DEV_PASSWORD ?? null];
  return createHmac('sha256', config.AUTH_SESSION_SECRET!)
    .update(JSON.stringify(['session-identity-v1', config.AUTH_PROVIDER, config.AUTH_SESSION_TTL_MS, credentials]))
    .digest('hex');
}

export class DurableSessionManager implements ApiSessions {
  readonly #file: string;
  readonly #secret: string;
  readonly #binding: string;
  readonly #provider: string;
  readonly #now: () => number;
  readonly #max: number;
  readonly ttlMs: number;

  constructor(opts: {
    file: string;
    secret: string;
    binding: string;
    provider: string;
    ttlMs: number;
    now?: () => number;
    maxSessions?: number;
  }) {
    if (opts.secret.length < 32) throw new Error('Session secret must be at least 32 characters');
    if (!Number.isSafeInteger(opts.ttlMs) || opts.ttlMs < 1000) throw new Error('Session TTL must be at least 1 s');
    if (
      opts.maxSessions !== undefined &&
      (!Number.isSafeInteger(opts.maxSessions) || opts.maxSessions < 1 || opts.maxSessions > 10_000)
    )
      throw new Error('maxSessions must be between 1 and 10000');
    this.#file = resolve(opts.file);
    this.#secret = opts.secret;
    this.#binding = opts.binding;
    this.#provider = opts.provider;
    this.ttlMs = opts.ttlMs;
    this.#now = opts.now ?? Date.now;
    this.#max = opts.maxSessions ?? 10_000;
  }

  initialize(): Promise<void> {
    return this.transaction(async () => undefined);
  }

  private async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const previous = tails.get(this.#file) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        mkdirSync(dirname(this.#file), { recursive: true });
        // The installed SDK applies timeout to every SQLite connection, including transactions.
        const client = createClient({ url: pathToFileURL(this.#file).href, timeout: 5000 });
        try {
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
      })
      .catch((error: unknown) => {
        if (error instanceof LabError) throw error;
        throw unavailable();
      });
    tails.set(this.#file, operation);
    try {
      return await operation;
    } finally {
      if (tails.get(this.#file) === operation) tails.delete(this.#file);
    }
  }

  private integrity(sidHash: string, principal: string, created: number, expires: number, binding: string) {
    return createHmac('sha256', this.#secret)
      .update(JSON.stringify(['session-row-v1', sidHash, principal, created, expires, binding]))
      .digest('hex');
  }

  private decode(row: Row | undefined, sid: string): Session | null {
    if (!row || row.binding !== this.#binding) return null;
    const createdAt = Number(row.created_at),
      expiresAt = Number(row.expires_at);
    if (
      !Number.isSafeInteger(createdAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= this.#now() ||
      expiresAt <= createdAt
    )
      return null;
    const json = String(row.principal_json);
    if (!safeEqual(String(row.integrity), this.integrity(digest(sid), json, createdAt, expiresAt, String(row.binding))))
      return null;
    try {
      const principal = PrincipalSchema.parse(JSON.parse(json));
      if (principal.provider !== this.#provider) return null;
      return { sid, principal, createdAt, expiresAt };
    } catch {
      return null;
    }
  }

  create(principal: Principal, previousSid?: string): Promise<SessionCreation> {
    const validated = PrincipalSchema.parse(principal);
    if (validated.provider !== this.#provider)
      throw new LabError('UNAUTHORIZED', 'Session identity does not match this provider.');
    return this.transaction(async (tx) => {
      const now = this.#now();
      await tx.execute({ sql: 'DELETE FROM app_sessions WHERE expires_at <= ?', args: [now] });
      if (previousSid) {
        const old = await tx.execute({ sql: 'SELECT * FROM app_sessions WHERE sid_hash = ?', args: [digest(previousSid)] });
        if (!this.decode(old.rows[0], previousSid)) throw new LabError('UNAUTHORIZED', 'Session changed. Sign in again.');
        await tx.execute({ sql: 'DELETE FROM app_sessions WHERE sid_hash = ?', args: [digest(previousSid)] });
      }
      const count = Number((await tx.execute('SELECT COUNT(*) AS count FROM app_sessions')).rows[0]?.count ?? 0);
      if (count >= this.#max)
        await tx.execute({
          sql: 'DELETE FROM app_sessions WHERE sid_hash IN (SELECT sid_hash FROM app_sessions ORDER BY created_at, rowid LIMIT ?)',
          args: [count - this.#max + 1],
        });
      const { sid, cookieValue } = createSessionCookie(this.#secret);
      const session: Session = { sid, principal: validated, createdAt: now, expiresAt: now + this.ttlMs };
      const json = JSON.stringify(validated),
        sidHash = digest(sid);
      await tx.execute({
        sql: 'INSERT INTO app_sessions (sid_hash, principal_json, created_at, expires_at, binding, integrity) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          sidHash,
          json,
          now,
          session.expiresAt,
          this.#binding,
          this.integrity(sidHash, json, now, session.expiresAt, this.#binding),
        ],
      });
      return { cookieValue, session };
    });
  }

  verify(cookie: string | undefined): Promise<Session | null> {
    const sid = sessionIdFromCookie(this.#secret, cookie);
    if (!sid) return Promise.resolve(null);
    return this.transaction(async (tx) => {
      const result = await tx.execute({ sql: 'SELECT * FROM app_sessions WHERE sid_hash = ?', args: [digest(sid)] });
      const session = this.decode(result.rows[0], sid);
      if (result.rows[0] && Number(result.rows[0].expires_at) <= this.#now())
        await tx.execute({ sql: 'DELETE FROM app_sessions WHERE sid_hash = ?', args: [digest(sid)] });
      return session;
    });
  }

  revoke(sid: string): Promise<boolean> {
    return this.transaction(async (tx) => {
      const result = await tx.execute({ sql: 'DELETE FROM app_sessions WHERE sid_hash = ?', args: [digest(sid)] });
      return result.rowsAffected > 0;
    });
  }
}
