import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClientError } from '@mlp/client';
import { ApiErrorSchema } from '@mlp/contracts';
import { LabRegistry, makeTestLab } from '@mlp/lab-engine';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';

const apps: ApiApp[] = [];
let sequence = 0;
let now = 0;
function make(env: Record<string, string> = {}) {
  now = 0;
  const api = createApp({
    config: parseConfig({
      NODE_ENV: 'test',
      AUTH_DEV_USERS: 'alice,bob',
      RUN_RATE_WINDOW_MS: '2000',
      RUN_START_RATE_USER_MAX: '2',
      RUN_START_RATE_IP_MAX: '10',
      RUN_CONTROL_RATE_USER_MAX: '1',
      RUN_CONTROL_RATE_IP_MAX: '10',
      ...env,
    }),
    memoryDir: testMemoryDir(`rate-http-${++sequence}`),
    registry: new LabRegistry([makeTestLab(), makeTestLab({ id: 'lab-98', number: 98 })]),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    rateLimitNow: () => now,
  });
  apps.push(api);
  return api;
}
async function login(api: ApiApp, username = 'alice') {
  const r = await request(api.app).post('/api/auth/login').send({ username }).expect(200);
  const setCookie: unknown = r.headers['set-cookie'];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;
}
function start(api: ApiApp, cookie: string, lab = 'lab-99', behavior = 'ok') {
  return request(api.app)
    .post(`/api/labs/${lab}/runs`)
    .set('Cookie', cookie)
    .send({ input: { text: 'hello', behavior } });
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.runner.dispose()));
});

it('counts across labs and login sessions, rejects before start and admits again at exact expiry', async () => {
  const api = make({ RUN_START_RATE_USER_MAX: '1' }),
    a = await login(api);
  const starts = vi.spyOn(api.runner, 'start');
  await start(api, a).expect(202);
  const rotated = await login(api);
  const denied = await start(api, rotated, 'lab-98').expect(429);
  expect(ApiErrorSchema.parse(denied.body).error).toMatchObject({ code: 'TOO_MANY_REQUESTS', retryable: true });
  expect(denied.headers['retry-after']).toBe('2');
  expect(denied.headers['cache-control']).toBe('no-store');
  expect(denied.body.error.message).toContain('Try again in 2 seconds');
  expect(starts).toHaveBeenCalledTimes(1);
  now = 1999;
  expect((await start(api, rotated).expect(429)).headers['retry-after']).toBe('1');
  now = 2000;
  await start(api, rotated).expect(202);
  expect(starts).toHaveBeenCalledTimes(2);
});

it('shares direct network allowance across learners and ignores spoofed forwarding headers by default', async () => {
  const api = make({ RUN_START_RATE_IP_MAX: '1' }),
    a = await login(api),
    b = await login(api, 'bob');
  await start(api, a).set('X-Forwarded-For', '192.0.2.1').expect(202);
  await start(api, b).set('X-Forwarded-For', '192.0.2.2').expect(429);
});

it('honors configured proxy trust while keeping the subject quota across client addresses', async () => {
  const api = make({ TRUST_PROXY: 'loopback', RUN_START_RATE_USER_MAX: '1', RUN_START_RATE_IP_MAX: '1' });
  const a = await login(api),
    b = await login(api, 'bob');
  await start(api, a).set('X-Forwarded-For', '192.0.2.1').expect(202);
  await start(api, a).set('X-Forwarded-For', '192.0.2.2').expect(429);
  await start(api, b).set('X-Forwarded-For', '192.0.2.2').expect(202); // denial did not charge this IP
});

it('shares approval/recovery allowance and preserves pending state, cancellation and replay when denied', async () => {
  const api = make(),
    a = await login(api);
  const started = (await start(api, a, 'lab-99', 'approval').expect(202)).body;
  const pending = api.runner.events(started.runId).find((e) => e.type === 'approval-request');
  if (pending?.type !== 'approval-request') throw new Error('Expected pending approval');
  const recover = () =>
    request(api.app).post(`/api/runs/${started.runId}/recover`).set({ Cookie: a, 'x-run-subject': 'dev%3Aalice' });
  const recovered = await recover().expect(200);
  const decisions = vi.spyOn(api.runner, 'resolveApproval'),
    capabilities = vi.spyOn(api.runner, 'recoverToken');
  await request(api.app)
    .post(`/api/runs/${started.runId}/approvals/${pending.approvalId}`)
    .set({ Cookie: a, 'x-run-token': recovered.body.runToken })
    .send({ decision: 'approve' })
    .expect(429);
  await recover().expect(429);
  expect(decisions).not.toHaveBeenCalled();
  expect(capabilities).not.toHaveBeenCalled();
  expect(api.runner.get(started.runId)?.pendingApprovals).toBe(1);
  expect(api.runner.events(started.runId).some((e) => e.type === 'approval-resolved')).toBe(false);
  await request(api.app)
    .post(`/api/runs/${started.runId}/cancel`)
    .set({ Cookie: a, 'x-run-token': started.runToken })
    .expect(200);
  await api.runner.waitFor(started.runId);
  await request(api.app).get(`/api/runs/${started.runId}`).set('Cookie', a).expect(200);
  const replay = await request(api.app).get(`/api/runs/${started.runId}/events`).set('Cookie', a).expect(200);
  expect(replay.text).toContain('"status":"cancelled"');
  await request(api.app).get('/api/runs?labId=lab-99').set({ Cookie: a, 'x-run-subject': 'dev%3Aalice' }).expect(200);
});

it('preserves authentication, owner and expected-account checks without consuming a victim allowance', async () => {
  const api = make({ RUN_START_RATE_USER_MAX: '1' }),
    a = await login(api),
    b = await login(api, 'bob');
  await request(api.app)
    .post('/api/labs/lab-99/runs')
    .send({ input: { text: 'anonymous' } })
    .expect(401);
  const started = (await start(api, a, 'lab-99', 'approval').expect(202)).body;
  const path = `/api/runs/${started.runId}/recover`;
  await request(api.app).post(path).expect(401);
  await request(api.app).post(path).set({ Cookie: b, 'x-run-subject': 'dev%3Abob' }).expect(404);
  await request(api.app).post(path).set({ Cookie: a, 'x-run-subject': 'dev%3Abob' }).expect(404);
  await request(api.app)
    .post(`/api/runs/${started.runId}/approvals/unknown`)
    .set('Cookie', b)
    .send({ decision: 'approve' })
    .expect(404);
  await request(api.app).post(path).set({ Cookie: a, 'x-run-subject': 'dev%3Aalice' }).expect(200);
});

it('counts invalid owner control attempts but never resolves an approval with a wrong capability', async () => {
  const api = make(),
    a = await login(api);
  const started = (await start(api, a, 'lab-99', 'approval').expect(202)).body;
  const event = api.runner.events(started.runId).find((e) => e.type === 'approval-request');
  if (event?.type !== 'approval-request') throw new Error('Expected approval');
  const path = `/api/runs/${started.runId}/approvals/${event.approvalId}`;
  await request(api.app).post(path).set({ Cookie: a, 'x-run-token': 'wrong' }).send({ decision: 'approve' }).expect(403);
  await request(api.app).post(path).set({ Cookie: a, 'x-run-token': started.runToken }).send({ decision: 'approve' }).expect(429);
  expect(api.runner.get(started.runId)?.pendingApprovals).toBe(1);
  now = 2000;
  await request(api.app).post(path).set({ Cookie: a, 'x-run-token': started.runToken }).send({ decision: 'approve' }).expect(200);
  await api.runner.waitFor(started.runId);
  expect(api.runner.get(started.runId)?.status).toBe('succeeded');
});

it('admits only the configured number in a concurrent burst', async () => {
  const api = make({ RUN_START_RATE_USER_MAX: '1' }),
    a = await login(api);
  const starts = vi.spyOn(api.runner, 'start');
  const results = await Promise.all(Array.from({ length: 5 }, () => start(api, a)));
  expect(results.map((r) => r.status).sort()).toEqual([202, 429, 429, 429, 429]);
  expect(starts).toHaveBeenCalledTimes(1);
});

it('propagates real HTTP throttling through the typed SDK without retrying mutations', async () => {
  const api = make({ RUN_START_RATE_USER_MAX: '1' }),
    a = await login(api);
  const server = api.app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const calls = vi.fn<typeof fetch>((url, init) => fetch(url, { ...init, headers: { ...init?.headers, Cookie: a } }));
  const client = createApiClient({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fetch: calls });
  try {
    await client.runs.start('lab-99', { input: { text: 'first' } });
    await expect(client.runs.start('lab-99', { input: { text: 'second' } })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'TOO_MANY_REQUESTS',
      status: 429,
      retryable: true,
    } satisfies Partial<ApiClientError>);
    expect(calls).toHaveBeenCalledTimes(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
