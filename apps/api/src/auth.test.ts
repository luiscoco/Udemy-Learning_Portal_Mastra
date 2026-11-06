import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionResponseSchema, StartRunResponseSchema } from '@mlp/contracts';
import { createApp, type ApiApp } from './app.js';
import { parseConfig, secretValues } from './config.js';

const PASSWORD = 'test-passcode-only-61';
const SECRET = 'test-session-secret-only-61-at-least-32-characters';
const apps: ApiApp[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
function make(extra: Record<string, string> = {}) {
  const api = createApp({
    config: parseConfig({
      NODE_ENV: 'test',
      AUTH_DEV_USERS: 'alice,bob',
      AUTH_DEV_PASSWORD: PASSWORD,
      AUTH_SESSION_SECRET: SECRET,
      ...extra,
    }),
    logger,
  });
  apps.push(api);
  return api;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.runner.dispose()));
  vi.clearAllMocks();
});
const cookieOf = (res: { headers: Record<string, unknown> }) => String((res.headers['set-cookie'] as string[])[0]).split(';')[0]!;
async function login(api: ApiApp, username = 'alice') {
  return request(api.app).post('/api/auth/login').send({ username, password: PASSWORD }).expect(200);
}

describe('authentication boundary', () => {
  it('keeps discovery public and refuses every anonymous run operation before creating a run', async () => {
    const api = make();
    const start = vi.spyOn(api.runner, 'start');
    for (const path of [
      '/api/health',
      '/api/catalog',
      '/api/labs/lab-00',
      '/api/labs/lab-00/source',
      '/api/labs/lab-00/preflight',
    ])
      await request(api.app).get(path).expect(200);
    const session = await request(api.app).get('/api/auth/session').expect(200);
    expect(SessionResponseSchema.parse(session.body).authenticated).toBe(false);
    await request(api.app).post('/api/labs/lab-00/runs').send({ input: {} }).expect(401);
    for (const path of ['/api/runs/unknown', '/api/runs/unknown/events']) await request(api.app).get(path).expect(401);
    await request(api.app).post('/api/runs/unknown/cancel').expect(401);
    await request(api.app).post('/api/runs/unknown/approvals/a').send({ decision: 'approve' }).expect(401);
    expect(start).not.toHaveBeenCalled();
  });

  it('uses an opaque HttpOnly cookie, rotates sessions and revokes on logout without leaking credentials', async () => {
    const api = make();
    const signed = await login(api);
    const cookie = cookieOf(signed);
    const flags = String(signed.headers['set-cookie']);
    expect(flags).toContain('HttpOnly');
    expect(flags).toContain('SameSite=Strict');
    expect(flags).toContain('Path=/api');
    expect(signed.headers['cache-control']).toBe('no-store');
    expect(SessionResponseSchema.parse(signed.body).principal?.sub).toBe('dev:alice');
    const second = await request(api.app)
      .post('/api/auth/login')
      .set('Cookie', cookie)
      .send({ username: 'alice', password: PASSWORD })
      .expect(200);
    expect(cookieOf(second)).not.toBe(cookie);
    expect((await request(api.app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated).toBe(false);
    const loggedOut = await request(api.app).post('/api/auth/logout').set('Cookie', cookieOf(second)).expect(200);
    expect(String(loggedOut.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request(api.app).get('/api/auth/session').set('Cookie', cookieOf(second))).body.authenticated).toBe(false);
    const publicData = JSON.stringify([signed.body, second.body, loggedOut.body, logger.info.mock.calls, logger.warn.mock.calls]);
    for (const secret of [PASSWORD, SECRET, cookie.split('=')[1]!, cookieOf(second).split('=')[1]!])
      expect(publicData).not.toContain(secret);
    expect(secretValues(parseConfig({ AUTH_DEV_PASSWORD: PASSWORD, AUTH_SESSION_SECRET: SECRET }))).toEqual([SECRET, PASSWORD]);
  });

  it('treats altered and expired cookies as anonymous', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const api = make();
      const signed = await login(api);
      const cookie = cookieOf(signed);
      const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
      expect((await request(api.app).get('/api/auth/session').set('Cookie', tampered)).body.authenticated).toBe(false);
      vi.setSystemTime(Date.now() + 9 * 3_600_000);
      await request(api.app).post('/api/labs/lab-00/runs').set('Cookie', cookie).send({ input: {} }).expect(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires the owning learner for snapshots, SSE, cancellation and approvals, even with a stolen run token', async () => {
    const api = make();
    const alice = cookieOf(await login(api));
    const bob = cookieOf(await login(api, 'bob'));
    const started = await request(api.app)
      .post('/api/labs/lab-00/runs')
      .set('Cookie', alice)
      .send({ input: { message: 'private', delayMs: 0 } })
      .expect(202);
    const run = StartRunResponseSchema.parse(started.body);
    await api.runner.waitFor(run.runId);
    expect(api.runner.ownerOf(run.runId)).toBe('dev:alice');
    expect(JSON.stringify(api.runner.get(run.runId))).not.toContain('dev:alice');
    for (const path of [`/api/runs/${run.runId}`, `/api/runs/${run.runId}/events`]) {
      await request(api.app).get(path).set('Cookie', bob).expect(404);
      await request(api.app).get(path).set('Cookie', alice).expect(200);
    }
    for (const suffix of ['cancel', 'approvals/unknown']) {
      await request(api.app)
        .post(`/api/runs/${run.runId}/${suffix}`)
        .set('Cookie', bob)
        .set('X-Run-Token', run.runToken)
        .send({ decision: 'approve' })
        .expect(404);
    }
    await request(api.app).post(`/api/runs/${run.runId}/cancel`).set('Cookie', alice).expect(403);
    await request(api.app)
      .post(`/api/runs/${run.runId}/cancel`)
      .set('Cookie', alice)
      .set('X-Run-Token', run.runToken)
      .expect(200);
  });

  it('returns generic failures, limits login attempts and rejects foreign-origin mutations', async () => {
    const api = make({ AUTH_LOGIN_RATE_MAX: '2' });
    const unknown = await request(api.app).post('/api/auth/login').send({ username: 'unknown', password: PASSWORD }).expect(401);
    const wrong = await request(api.app).post('/api/auth/login').send({ username: 'alice', password: 'wrong' }).expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    await request(api.app).post('/api/auth/login').send({ username: 'alice', password: PASSWORD }).expect(429);
  });

  it('checks Origin on login, logout, run starts and decisions', async () => {
    const api = make();
    for (const path of [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/labs/lab-00/runs',
      '/api/runs/unknown/cancel',
      '/api/runs/unknown/approvals/a',
    ])
      await request(api.app).post(path).set('Origin', 'https://foreign.example').send({}).expect(403);
    await request(api.app)
      .post('/api/auth/login')
      .set('Host', 'localhost:8787')
      .set('Origin', 'http://localhost:8787')
      .send({ username: 'alice', password: PASSWORD })
      .expect(200);
  });

  it('fails closed in production or on a public interface', () => {
    expect(() => make({ NODE_ENV: 'production' })).toThrow('production IdentityProvider');
    expect(() => make({ HOST: '0.0.0.0' })).toThrow('loopback');
  });
  it('enforces the same boundary in live server mode before any provider call', async () => {
    const api = make({ MASTRA_MODE: 'live' });
    const start = vi.spyOn(api.runner, 'start');
    await request(api.app).post('/api/labs/lab-03/runs').send({ mode: 'live', input: {} }).expect(401);
    expect(start).not.toHaveBeenCalled();
    const cookie = cookieOf(await login(api));
    const run = await request(api.app)
      .post('/api/labs/lab-00/runs')
      .set('Cookie', cookie)
      .send({ input: { message: 'offline on a live-enabled server', delayMs: 0 }, mode: 'offline' })
      .expect(202);
    await api.runner.waitFor(run.body.runId as string);
  });
});

describe('automatic local learner entry', () => {
  it('keeps session discovery read-only and creates a normal idempotent protected session', async () => {
    const api = make({ AUTH_DEV_USERS: ' Learner,learner, ', AUTH_DEV_PASSWORD: '' });
    const view = await request(api.app).get('/api/auth/session').expect(200);
    expect(view.body).toMatchObject({ authenticated: false, login: { autoLocal: true } });
    expect(view.headers['set-cookie']).toBeUndefined();
    await request(api.app).post('/api/labs/lab-00/runs').send({ input: {} }).expect(401);
    const first = await request(api.app).post('/api/auth/local-session').send({}).expect(200);
    expect(first.body.principal.sub).toBe('dev:learner');
    expect(String(first.headers['set-cookie'])).toContain('HttpOnly');
    const cookie = cookieOf(first);
    const second = await request(api.app).post('/api/auth/local-session').set('Cookie', cookie).send({}).expect(200);
    expect(second.body).toEqual(first.body);
    expect(second.headers['set-cookie']).toBeUndefined();
    await request(api.app)
      .get('/api/auth/session')
      .set('Cookie', cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.authenticated).toBe(true);
      });
  });
  it.each([
    { AUTH_DEV_USERS: 'alice,bob', AUTH_DEV_PASSWORD: '', AUTH_LOCAL_AUTO_LOGIN: 'true' },
    { AUTH_DEV_USERS: 'learner', AUTH_DEV_PASSWORD: PASSWORD, AUTH_LOCAL_AUTO_LOGIN: 'true' },
    { AUTH_DEV_USERS: 'learner', AUTH_DEV_PASSWORD: '', AUTH_LOCAL_AUTO_LOGIN: 'false' },
  ])('refuses automatic entry when protected or opted out: %j', async (config) => {
    const api = make(config);
    const view = await request(api.app).get('/api/auth/session').expect(200);
    expect(view.body.login.autoLocal).toBe(false);
    await request(api.app).post('/api/auth/local-session').send({}).expect(403);
  });
  it('rejects cross-origin entry and arbitrary identities and limits session creation', async () => {
    const api = make({ AUTH_DEV_USERS: 'learner', AUTH_DEV_PASSWORD: '', AUTH_LOGIN_RATE_MAX: '1' });
    await request(api.app).post('/api/auth/local-session').set('Origin', 'https://evil.example').send({}).expect(403);
    await request(api.app).post('/api/auth/local-session').send({ username: 'admin' }).expect(400);
    await request(api.app).post('/api/auth/local-session').send({}).expect(200);
    await request(api.app).post('/api/auth/local-session').send({}).expect(429);
  });
});
