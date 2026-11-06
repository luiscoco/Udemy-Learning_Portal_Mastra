import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { hashUserEntry } from '@mlp/auth';
import { ReadinessResponseSchema, SessionResponseSchema } from '@mlp/contracts';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';

const tmp = mkdtempSync(join(tmpdir(), 'mlp-api-deploy-'));
afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows: the readiness probe's libSQL file stays locked until the process exits
  }
});
const SECRET = 'test-session-secret-only-72-at-least-32-characters';
const apps: ApiApp[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
function make(env: Record<string, string> = {}) {
  const api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_SESSION_SECRET: SECRET, LOG_LEVEL: 'silent', ...env }),
    logger,
    dataDir: join(tmp, `d${apps.length}`),
  });
  apps.push(api);
  return api;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (a) => (await a.runner.dispose(), await a.readiness.close())));
  vi.clearAllMocks();
});

describe('readiness and access logs', () => {
  it('/api/ready reports every dependency; draining turns it 503 while liveness stays 200', async () => {
    const api = make();
    const ok = await request(api.app).get('/api/ready').expect(200);
    const body = ReadinessResponseSchema.parse(ok.body);
    expect(body.status).toBe('ready');
    expect(body.checks.map((c) => c.name)).toEqual(['config', 'data-dir', 'storage', 'web-bundle', 'providers', 'runner']);
    expect(ok.headers['cache-control']).toBe('no-store');
    api.drain();
    await new Promise((r) => setTimeout(r, 2_100)); // past the 2 s readiness cache
    const drained = await request(api.app).get('/api/ready').expect(503);
    expect(ReadinessResponseSchema.parse(drained.body).checks.find((c) => c.name === 'runner')?.status).toBe('fail');
    await request(api.app).get('/api/health').expect(200);
  });

  it('logs one access line per request, without the query string', async () => {
    const api = make();
    await request(api.app).get('/api/health?token=SHOULD-NOT-BE-LOGGED').expect(200);
    await request(api.app).get('/api/auth/session').expect(200);
    expect(logger.info.mock.calls.filter((c) => c[0] === 'request').map((c) => (c[1] as { path: string }).path)).toEqual([
      '/api/health',
      '/api/auth/session',
    ]);
    const line = logger.info.mock.calls.find((c) => c[0] === 'request');
    expect(line?.[1]).toMatchObject({ method: 'GET', path: '/api/health', status: 200 });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('SHOULD-NOT-BE-LOGGED');
    const quiet = make({ LOG_REQUESTS: 'false' });
    logger.info.mockClear();
    await request(quiet.app).get('/api/health').expect(200);
    expect(logger.info.mock.calls.some((c) => c[0] === 'request')).toBe(false);
  });
});

describe('password login', () => {
  it('signs in a hashed user and reports the password login kind', async () => {
    const api = make({ AUTH_PROVIDER: 'password', AUTH_USERS: await hashUserEntry('ana', 'a long test password') });
    const view = SessionResponseSchema.parse((await request(api.app).get('/api/auth/session').expect(200)).body);
    expect(view.login).toEqual({ kind: 'password', passwordRequired: true, autoLocal: false });
    await request(api.app).post('/api/auth/login').send({ username: 'ana', password: 'wrong password here' }).expect(401);
    const ok = await request(api.app)
      .post('/api/auth/login')
      .send({ username: 'ana', password: 'a long test password' })
      .expect(200);
    expect(SessionResponseSchema.parse(ok.body).principal).toMatchObject({ sub: 'password:ana', name: 'ana' });
  });
});

describe('start-up', () => {
  const run = promisify(execFile);
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
  it('refuses a production start without a session secret: exit 78 and a message naming the key', async () => {
    const audit = 'audit-key-for-the-startup-test-0123456789';
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const server = join(repoRoot, 'apps', 'api', 'src', 'server.ts');
    const err = await run(process.execPath, ['--import', tsx, server], {
      cwd: tmp, // no .env here or two levels up of the temp dir
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        AUTH_PROVIDER: 'password',
        AUTH_USERS: await hashUserEntry('ana', 'a long test password'),
        AUDIT_HMAC_KEY: audit,
        MLP_DATA_DIR: join(tmp, 'data'),
      },
      timeout: 60_000,
    }).then(
      () => null,
      (e: { code: number; stderr: string }) => e,
    );
    expect(err?.code).toBe(78);
    expect(err?.stderr).toContain(
      '[config] Refusing to start (NODE_ENV=production): AUTH_SESSION_SECRET is required in production (set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE)',
    );
    expect(err?.stderr).not.toContain(audit);
  }, 90_000);
});
