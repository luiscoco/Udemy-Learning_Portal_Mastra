import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LabRegistry, makeTestLab } from '@mlp/lab-engine';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const apps: ApiApp[] = [];
const roots: string[] = [];
function make(env: Record<string, string> = {}) {
  const api = createApp({
    config: parseConfig({ NODE_ENV: 'test', ...env }),
    registry: new LabRegistry([makeTestLab()]),
    logger: createLogger('silent'),
  });
  apps.push(api);
  return api;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.runner.dispose()));
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected hidden-site cleanup root');
    rmSync(root, { recursive: true, force: true });
  }
});

it('serves the allowlisted SPA index from hidden install parents without exposing other dotfiles', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mlp-hidden-site-'));
  roots.push(root);
  const dist = join(root, '.hidden', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Local course</title>');
  writeFileSync(join(dist, '.private'), 'private-content');
  const api = make({ WEB_DIST_DIR: dist });
  const page = await request(api.app).get('/labs/lab-00').expect(200);
  expect(page.text).toContain('Local course');
  expect((await request(api.app).get('/.private')).text).not.toContain('private-content');
});

it('protects API, parser and route errors without unsafe script permissions or HTTP HSTS', async () => {
  const api = make();
  const responses = [
    await request(api.app).get('/api/catalog'),
    await request(api.app).get('/api/unknown'),
    await request(api.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{'),
  ];
  expect(responses.map((r) => r.status)).toEqual([200, 404, 400]);
  for (const r of responses) {
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect(r.headers['content-security-policy']).not.toContain('unsafe-eval');
    expect(r.headers['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['permissions-policy']).toContain('microphone=(self)');
    expect(r.headers['strict-transport-security']).toBeUndefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
  }
});

it('accepts exact configured credentialed origin and validates preflight without authenticating it', async () => {
  const api = make({ CORS_ORIGIN: 'https://learn.example.com' });
  const preflight = await request(api.app)
    .options('/api/labs/lab-99/runs')
    .set({
      Origin: 'https://learn.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, X-Run-Token',
    })
    .expect(204);
  expect(preflight.headers['access-control-allow-origin']).toBe('https://learn.example.com');
  expect(preflight.headers['access-control-allow-credentials']).toBe('true');
  expect(preflight.headers.vary).toContain('Origin');
  const login = await request(api.app)
    .post('/api/auth/login')
    .set('Origin', 'https://learn.example.com')
    .send({ username: 'learner' })
    .expect(200);
  expect(login.headers['access-control-allow-origin']).toBe('https://learn.example.com');
  const denied = await request(api.app)
    .post('/api/labs/lab-99/runs')
    .set('Origin', 'https://learn.example.com')
    .send({ input: { text: 'hello' } })
    .expect(401);
  expect(denied.headers['access-control-allow-origin']).toBe('https://learn.example.com');
});

it('refuses untrusted origins, wildcards and unsupported preflight methods or headers before actions', async () => {
  const api = make({ CORS_ORIGIN: 'https://learn.example.com' });
  for (const origin of [
    'https://evil.example',
    'null',
    'https://learn.example.com.evil.example',
    'https://learn.example.com/path',
  ]) {
    const r = await request(api.app).post('/api/auth/login').set('Origin', origin).send({ username: 'learner' }).expect(403);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['set-cookie']).toBeUndefined();
  }
  await request(api.app)
    .options('/api/labs/lab-99/runs')
    .set({ Origin: 'https://learn.example.com', 'Access-Control-Request-Method': 'DELETE' })
    .expect(403);
  await request(api.app)
    .options('/api/labs/lab-99/runs')
    .set({
      Origin: 'https://learn.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'X-Unapproved',
    })
    .expect(403);
});

it('ignores untrusted forwarding headers and refuses insecure actions while retaining health probes', async () => {
  const api = make({ HTTP_REQUIRE_HTTPS: 'true' });
  await request(api.app).post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({ username: 'learner' }).expect(403);
  const probe = await request(api.app).get('/api/health').expect(200);
  expect(probe.headers['strict-transport-security']).toBeUndefined();
  await request(api.app).get('/api/auth/session').expect(403);
});

it('accepts HTTPS from an explicitly trusted proxy and keeps HTTP from receiving HSTS', async () => {
  const api = make({ HTTP_REQUIRE_HTTPS: 'true', TRUST_PROXY: 'loopback' });
  const https = await request(api.app).get('/api/catalog').set('X-Forwarded-Proto', 'https').expect(200);
  expect(https.headers['strict-transport-security']).toBe('max-age=31536000');
  const http = await request(api.app).get('/api/catalog').expect(403);
  expect(http.headers['strict-transport-security']).toBeUndefined();
  expect(http.headers.location).toBeUndefined();
});

it('validates origin and proxy configuration without permissive sentinels', () => {
  for (const origin of [
    '*',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?x=1',
    'null',
    'https://example.com/',
  ])
    expect(() => parseConfig({ CORS_ORIGIN: origin })).toThrow('CORS_ORIGIN');
  expect(parseConfig({ CORS_ORIGIN: '' }).CORS_ORIGIN).toBeUndefined();
  expect(() => parseConfig({ HTTP_REQUIRE_HTTPS: 'true', TRUST_PROXY: 'true' })).toThrow('TRUST_PROXY');
  expect(() => parseConfig({ HTTP_REQUIRE_HTTPS: 'true', CORS_ORIGIN: 'http://example.com' })).toThrow('CORS_ORIGIN');
});
