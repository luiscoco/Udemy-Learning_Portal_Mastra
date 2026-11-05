import { join } from 'node:path';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { LabRegistry, makeTestLab } from '@mlp/lab-engine';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';

const root = testMemoryDir('run-recovery-api');
let sequence = 0;
const apps: ApiApp[] = [];
const KEY = 'test-run-http-journal-key-at-least-32-characters';
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
function make(dir: string) {
  const api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'alice,bob', RUN_STORE: 'sqlite', RUN_STORE_SECRET: KEY }),
    dataDir: dir,
    memoryDir: join(dir, 'memory'),
    registry: new LabRegistry([makeTestLab()]),
    logger,
  });
  apps.push(api);
  return api;
}
const cookieOf = (r: { headers: Record<string, unknown> }) => String((r.headers['set-cookie'] as string[])[0]).split(';')[0]!;
const login = async (api: ApiApp, username = 'alice') =>
  cookieOf(await request(api.app).post('/api/auth/login').send({ username }).expect(200));
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.runner.dispose()));
  vi.clearAllMocks();
});

it('recovers live controls with owner binding while keeping all capabilities private', async () => {
  const api = make(join(root, String(++sequence))),
    alice = await login(api),
    bob = await login(api, 'bob');
  const started = await request(api.app)
    .post('/api/labs/lab-99/runs')
    .set('Cookie', alice)
    .send({ input: { text: 'hello', behavior: 'approval' } })
    .expect(202);
  const id = started.body.runId;
  const pending = api.runner.events(id).find((e) => e.type === 'approval-request');
  expect(pending?.type).toBe('approval-request');
  await request(api.app).get('/api/runs?labId=lab-99').expect(401);
  await request(api.app).get('/api/runs?labId=lab-99').set({ Cookie: bob, 'x-run-subject': 'dev%3Aalice' }).expect(404);
  expect(
    (await request(api.app).get('/api/runs?labId=lab-99').set({ Cookie: bob, 'x-run-subject': 'dev%3Abob' })).body.runs,
  ).toEqual([]);
  await request(api.app).post(`/api/runs/${id}/recover`).expect(401);
  await request(api.app).post(`/api/runs/${id}/recover`).set({ Cookie: bob, 'x-run-subject': 'dev%3Abob' }).expect(404);
  await request(api.app).post(`/api/runs/${id}/recover`).set('Cookie', alice).expect(404);
  const recovered = await request(api.app)
    .post(`/api/runs/${id}/recover`)
    .set({ Cookie: alice, 'x-run-subject': 'dev%3Aalice' })
    .expect(200);
  expect(recovered.headers['cache-control']).toBe('no-store');
  expect(recovered.body.snapshot.pendingApprovals).toBe(1);
  if (pending?.type !== 'approval-request') throw new Error('Missing approval');
  await request(api.app)
    .post(`/api/runs/${id}/approvals/${pending.approvalId}`)
    .set({ Cookie: alice, 'x-run-token': recovered.body.runToken })
    .send({ decision: 'approve' })
    .expect(200);
  await api.runner.waitFor(id);
  await request(api.app).post(`/api/runs/${id}/cancel`).set({ Cookie: alice, 'x-run-token': started.body.runToken }).expect(200);
  const snapshot = await request(api.app).get(`/api/runs/${id}`).set('Cookie', alice).expect(200);
  const stream = await request(api.app).get(`/api/runs/${id}/events`).set('Cookie', alice).expect(200);
  const recent = await request(api.app)
    .get('/api/runs?labId=lab-99')
    .set({ Cookie: alice, 'x-run-subject': 'dev%3Aalice' })
    .expect(200);
  const publicData = JSON.stringify([snapshot.body, stream.text, recent.body, logger.info.mock.calls, logger.error.mock.calls]);
  for (const value of [started.body.runToken, recovered.body.runToken, KEY]) expect(publicData).not.toContain(value);
});

it('serves retained snapshots and complete replay after restart without executing the lab', async () => {
  const dir = join(root, String(++sequence)),
    a = make(dir),
    cookie = await login(a);
  const started = await request(a.app)
    .post('/api/labs/lab-99/runs')
    .set('Cookie', cookie)
    .send({ input: { text: 'retained' } })
    .expect(202);
  await a.runner.waitFor(started.body.runId);
  await a.runner.dispose();
  const b = make(dir),
    nextCookie = await login(b);
  const start = vi.spyOn(b.runner, 'start');
  const snapshot = await request(b.app).get(`/api/runs/${started.body.runId}`).set('Cookie', nextCookie).expect(200);
  expect(snapshot.body.status).toBe('succeeded');
  const stream = await request(b.app).get(`/api/runs/${started.body.runId}/events`).set('Cookie', nextCookie).expect(200);
  expect(stream.text).toContain('retained');
  expect(stream.text).toContain('event: complete');
  expect(start).not.toHaveBeenCalled();
});
