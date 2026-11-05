import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, SessionResponseSchema } from '@mlp/contracts';
import { hashUserEntry } from '@mlp/auth';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';

const SECRET = 'test-durable-auth-secret-at-least-32-characters';
const root = testMemoryDir('durable-auth');
let sequence = 0;
const apps: ApiApp[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
function make(dir: string, extra: Record<string, string> = {}) {
  const config = parseConfig({
    NODE_ENV: 'test',
    AUTH_DEV_USERS: 'alice,bob',
    AUTH_SESSION_STORE: 'sqlite',
    AUTH_SESSION_SECRET: SECRET,
    ...extra,
  });
  const api = createApp({ config, dataDir: dir, memoryDir: join(dir, 'memory'), logger });
  apps.push(api);
  return api;
}
const cookieOf = (res: { headers: Record<string, unknown> }) => String((res.headers['set-cookie'] as string[])[0]).split(';')[0]!;
afterEach(async () => {
  await Promise.all(
    apps.splice(0).map(async (api) => {
      await api.auth.ready.catch(() => undefined);
      await api.runner.dispose();
      await api.readiness.close();
    }),
  );
  vi.clearAllMocks();
});

describe('durable HTTP authentication', () => {
  it('persists password-provider sessions and invalidates changed password configuration', async () => {
    const dir = join(root, String(++sequence));
    const password = 'test-password-with-12-characters';
    const users = await hashUserEntry('alice', password);
    const a = make(dir, { AUTH_PROVIDER: 'password', AUTH_USERS: users });
    const signed = await request(a.app).post('/api/auth/login').send({ username: 'alice', password }).expect(200);
    const cookie = cookieOf(signed);
    const b = make(dir, { AUTH_PROVIDER: 'password', AUTH_USERS: users });
    expect((await request(b.app).get('/api/auth/session').set('Cookie', cookie)).body.principal.sub).toBe('password:alice');
    const changed = make(dir, {
      AUTH_PROVIDER: 'password',
      AUTH_USERS: await hashUserEntry('alice', 'new-test-password-with-12-characters'),
    });
    expect((await request(changed.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(false);
  });

  it('commits only one concurrent HTTP rotation after both requests authenticate', async () => {
    const dir = join(root, String(++sequence));
    const a = make(dir),
      b = make(dir);
    const cookie = cookieOf(await request(a.app).post('/api/auth/login').send({ username: 'alice' }).expect(200));
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    for (const api of [a, b]) {
      const authenticate = api.auth.provider.authenticate.bind(api.auth.provider);
      vi.spyOn(api.auth.provider, 'authenticate').mockImplementation(async (credentials) => {
        const principal = await authenticate(credentials);
        if (++entered === 2) release();
        await gate;
        return principal;
      });
    }
    const results = await Promise.all(
      [a, b].map((api) => request(api.app).post('/api/auth/login').set('Cookie', cookie).send({ username: 'alice' })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect((await request(a.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(false);
    const winner = results.find((r) => r.status === 200)!;
    expect((await request(b.app).get('/api/auth/session').set('Cookie', cookieOf(winner))).body.authenticated).toBe(true);
  });

  it('shares cookies and durable rotation/logout across instances without changing HTTP views', async () => {
    const dir = join(root, String(++sequence));
    const a = make(dir),
      b = make(dir);
    const first = await request(a.app).post('/api/auth/login').send({ username: 'alice' }).expect(200);
    const cookie = cookieOf(first);
    expect(SessionResponseSchema.parse(first.body).principal?.sub).toBe('dev:alice');
    expect((await request(b.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(true);
    const second = await request(b.app).post('/api/auth/login').set('Cookie', cookie).send({ username: 'alice' }).expect(200);
    const rotated = cookieOf(second);
    expect(rotated).not.toBe(cookie);
    expect((await request(a.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(false);
    expect((await request(a.app).get('/api/auth/session').set('Cookie', rotated)).body.authenticated).toBe(true);
    await request(a.app).post('/api/auth/logout').set('Cookie', rotated).expect(200);
    expect((await request(make(dir).app).get('/api/auth/session').set('Cookie', rotated)).body.authenticated).toBe(false);
    const output = JSON.stringify([
      first.body,
      second.body,
      logger.info.mock.calls,
      logger.warn.mock.calls,
      logger.error.mock.calls,
    ]);
    for (const value of [SECRET, cookie.split('=')[1]!, rotated.split('=')[1]!]) expect(output).not.toContain(value);
  });

  it('restores account progress, preserves tenant isolation and refuses changed identity settings', async () => {
    const dir = join(root, String(++sequence));
    const a = make(dir);
    const cookie = cookieOf(await request(a.app).post('/api/auth/login').send({ username: 'alice' }).expect(200));
    const headers = { Cookie: cookie, 'x-progress-subject': encodeURIComponent('dev:alice') };
    await request(a.app)
      .post('/api/progress/lab-00')
      .set(headers)
      .send({ baseRevision: 0, record: { ...emptyProgress('lab-00'), notes: 'Persistent account note' } })
      .expect(200);
    const b = make(dir);
    expect((await request(b.app).get('/api/progress').set(headers).expect(200)).body.entries[0].record.notes).toBe(
      'Persistent account note',
    );
    await request(b.app)
      .get('/api/progress')
      .set({ ...headers, 'x-progress-subject': encodeURIComponent('dev:bob') })
      .expect(404);
    await request(b.app).post('/api/auth/logout').set(headers).set('Origin', 'https://foreign.example').expect(403);
    const changed = make(dir, { AUTH_DEV_USERS: 'bob' });
    expect((await request(changed.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(false);
    await request(changed.app).post('/api/labs/lab-00/runs').set('Cookie', cookie).send({ input: {} }).expect(401);
  });

  it('returns a safe uncached failure for runtime storage drift without authenticating from memory', async () => {
    const dir = join(root, String(++sequence));
    const a = make(dir);
    const signed = await request(a.app).post('/api/auth/login').send({ username: 'alice' }).expect(200);
    const cookie = cookieOf(signed);
    const client = createClient({ url: pathToFileURL(join(dir, 'auth', 'sessions.db')).href });
    try {
      await client.execute("UPDATE app_session_migrations SET checksum = 'bad'");
    } finally {
      client.close();
    }
    const failed = await request(a.app).get('/api/auth/session').set('Cookie', cookie).expect(503);
    expect(failed.body.error.code).toBe('NOT_CONFIGURED');
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(failed.body)).not.toContain(cookie.split('=')[1]!);
    expect(JSON.stringify(failed.body)).not.toContain(SECRET);
    const next = make(dir);
    await expect(next.auth.ready).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await request(next.app).post('/api/auth/login').send({ username: 'alice' }).expect(503);
  });
});
