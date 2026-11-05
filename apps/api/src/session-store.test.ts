import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { parseConfig } from './config.js';
import { DurableSessionManager, sessionIdentityBinding } from './session-store.js';

const directory = testMemoryDir('session-store');
const SECRET = 'test-durable-session-signing-key-32-characters';
const principal = { sub: 'dev:alice', name: 'alice', provider: 'dev' };
let sequence = 0;
const options = () => ({
  file: join(directory, `${++sequence}.db`),
  secret: SECRET,
  binding: 'test-identity-binding',
  provider: 'dev',
  ttlMs: 60_000,
});
async function sql(file: string, query: string) {
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    return await client.execute(query);
  } finally {
    client.close();
  }
}

describe('persistent sessions', () => {
  it('rolls back revocation when issuing the replacement session fails', async () => {
    const opts = options();
    const store = new DurableSessionManager(opts);
    const original = await store.create(principal);
    await sql(
      opts.file,
      "CREATE TRIGGER reject_session BEFORE INSERT ON app_sessions BEGIN SELECT RAISE(ABORT, 'test insert failure'); END",
    );
    await expect(store.create(principal, original.session.sid)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(await store.verify(original.cookieValue)).toEqual(original.session);
    expect((await sql(opts.file, 'SELECT COUNT(*) AS count FROM app_sessions')).rows[0]?.count).toBe(1);
  });

  it('reopens full sessions without storing replayable credentials and rejects other keys/bindings', async () => {
    const opts = options();
    const first = new DurableSessionManager(opts);
    const created = await first.create(principal);
    expect(await new DurableSessionManager(opts).verify(created.cookieValue)).toEqual(created.session);
    const stored = JSON.stringify((await sql(opts.file, 'SELECT * FROM app_sessions')).rows);
    for (const value of [created.cookieValue, created.session.sid, SECRET]) expect(stored).not.toContain(value);
    expect(
      await new DurableSessionManager({ ...opts, secret: 'other-test-signing-key-with-32-characters' }).verify(
        created.cookieValue,
      ),
    ).toBeNull();
    expect(await new DurableSessionManager({ ...opts, binding: 'new-policy' }).verify(created.cookieValue)).toBeNull();
    expect(await first.verify(created.cookieValue.slice(0, -1) + '!')).toBeNull();
  });

  it('shares logout and atomically allows only one rotation across manager instances', async () => {
    const opts = options();
    const a = new DurableSessionManager(opts),
      b = new DurableSessionManager(opts);
    const original = await a.create(principal);
    const rotations = await Promise.allSettled([
      a.create(principal, original.session.sid),
      b.create(principal, original.session.sid),
    ]);
    expect(rotations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rotations.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'UNAUTHORIZED' } });
    const winner = rotations.find((r) => r.status === 'fulfilled')!;
    if (winner.status !== 'fulfilled') throw new Error('Missing rotation');
    expect(await a.verify(original.cookieValue)).toBeNull();
    expect(await b.verify(winner.value.cookieValue)).not.toBeNull();
    expect(await b.revoke(winner.value.session.sid)).toBe(true);
    expect(await new DurableSessionManager(opts).verify(winner.value.cookieValue)).toBeNull();
    expect(await a.revoke(winner.value.session.sid)).toBe(false);
  });

  it('uses absolute expiry and enforces a persistent oldest-session cap', async () => {
    let now = 1000;
    const opts = { ...options(), now: () => now, maxSessions: 2 };
    const store = new DurableSessionManager(opts);
    const first = await store.create(principal);
    now += 100;
    const second = await store.create(principal);
    now += 100;
    expect((await store.verify(first.cookieValue))?.expiresAt).toBe(61_000);
    const third = await new DurableSessionManager(opts).create(principal);
    expect(await store.verify(first.cookieValue)).toBeNull();
    expect(await store.verify(second.cookieValue)).not.toBeNull();
    now = third.session.expiresAt;
    expect(await new DurableSessionManager(opts).verify(third.cookieValue)).toBeNull();
    await store.create(principal);
    expect((await sql(opts.file, 'SELECT COUNT(*) AS count FROM app_sessions')).rows[0]?.count).toBe(1);
  });

  it('refuses edited principal claims and expiry even with a valid cookie', async () => {
    for (const query of [
      `UPDATE app_sessions SET principal_json = '{"sub":"dev:bob","name":"bob","provider":"dev"}'`,
      'UPDATE app_sessions SET expires_at = expires_at + 100000',
    ]) {
      const opts = options();
      const store = new DurableSessionManager(opts);
      const created = await store.create(principal);
      await sql(opts.file, query);
      expect(await store.verify(created.cookieValue)).toBeNull();
    }
  });

  it('fails closed for migration checksum drift, newer schemas and unavailable paths', async () => {
    const opts = options();
    const store = new DurableSessionManager(opts);
    const created = await store.create(principal);
    await sql(opts.file, "UPDATE app_session_migrations SET checksum = 'changed'");
    await expect(store.verify(created.cookieValue)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await sql(opts.file, 'PRAGMA user_version = 2');
    await expect(new DurableSessionManager(opts).initialize()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    const blocked = join(directory, `blocked-${++sequence}`);
    writeFileSync(blocked, 'not a directory');
    await expect(new DurableSessionManager({ ...opts, file: join(blocked, 'sessions.db') }).initialize()).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('binds active identity credentials and TTL, normalizes allowlists and ignores provider API keys', () => {
    const env = { AUTH_SESSION_SECRET: SECRET, AUTH_DEV_USERS: 'bob,alice', AUTH_DEV_PASSWORD: 'test-password' };
    const binding = sessionIdentityBinding(parseConfig(env));
    expect(
      sessionIdentityBinding(parseConfig({ ...env, AUTH_DEV_USERS: 'Alice, bob,alice', OPENAI_API_KEY: 'test-provider-key' })),
    ).toBe(binding);
    for (const change of [
      { AUTH_DEV_USERS: 'alice' },
      { AUTH_DEV_PASSWORD: 'changed-password' },
      { AUTH_SESSION_TTL_MS: '60000' },
    ])
      expect(sessionIdentityBinding(parseConfig({ ...env, ...change }))).not.toBe(binding);
    const password = { ...env, AUTH_PROVIDER: 'password', AUTH_USERS: 'test-hash-entry' };
    expect(sessionIdentityBinding(parseConfig({ ...password, AUTH_USERS: 'alice:first,alice:second' }))).not.toBe(
      sessionIdentityBinding(parseConfig({ ...password, AUTH_USERS: 'alice:second,alice:first' })),
    );
    expect(sessionIdentityBinding(parseConfig(password))).not.toBe(binding);
    expect(sessionIdentityBinding(parseConfig(password))).toBe(
      sessionIdentityBinding(parseConfig({ ...password, AUTH_DEV_USERS: 'other', AUTH_DEV_PASSWORD: 'irrelevant' })),
    );
  });
});
