import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClientError, CLIENT_ROUTES, createApiClient, type ApiClient } from '@mlp/client';
import { emptyProgress, type ExecutionEvent } from '@mlp/contracts';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { ROUTE_CLASSES } from './route-classes.js';

// API contract tests (L66): the typed SDK drives the real API over HTTP. Every success body is parsed
// with its contract schema inside the SDK, so a drifting response fails here as a CONTRACT error.
let api: ApiApp;
let server: Server;
let base: string;

/** fetch with a cookie jar, like a browser tab (Node's fetch keeps no cookies). */
function browserLikeFetch(): typeof fetch {
  let cookie = '';
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    const res = await fetch(input, { ...init, headers });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
    return res;
  }) as typeof fetch;
}

beforeAll(async () => {
  api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'learner', AUTH_LOGIN_RATE_MAX: '100' }),
    logger: createLogger('silent'),
    memoryDir: testMemoryDir('api-contract'),
  });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await api.runner.dispose();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const client = (): ApiClient => createApiClient({ baseUrl: base, fetch: browserLikeFetch() });
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof ApiClientError ? `${e.status} ${e.code}` : String(e)),
  );

describe('API contract (L66)', () => {
  it('lists and recovers an owner execution through validated SDK methods', async () => {
    const c = client();
    await c.auth.login({ username: 'learner' });
    const started = await c.runs.start('lab-00', { input: { message: 'recover through SDK', delayMs: 0 } });
    await api.runner.waitFor(started.runId);
    expect((await c.runs.recent('lab-00', 'dev:learner')).runs.some((r) => r.runId === started.runId)).toBe(true);
    const recovered = await c.runs.recover(started.runId, 'dev:learner');
    expect(recovered.snapshot.runId).toBe(started.runId);
    expect(recovered.runToken).not.toBe(started.runToken);
    expect(await code(c.runs.recover(started.runId, 'dev:someone-else'))).toBe('404 NOT_FOUND');
  });
  it('progress methods validate account-scoped snapshots, saves, imports and resets', async () => {
    const c = client();
    await c.auth.login({ username: 'learner' });
    const record = emptyProgress('lab-02');
    expect((await c.progress.get('dev:learner')).entries).toEqual([]);
    const saved = await c.progress.save('dev:learner', 'lab-02', { record, baseRevision: 0 });
    expect(saved.revision).toBe(1);
    expect((await c.progress.import('dev:learner', { records: [record] })).entries).toHaveLength(1);
    expect((await c.progress.reset('dev:learner', 'lab-02', { baseRevision: 1 })).record).toBeNull();
    expect(await code(c.progress.get('dev:someone-else'))).toBe('404 NOT_FOUND');
  });
  it('the SDK has a method for every registered route, and no method for a route that is gone', () => {
    expect(Object.keys(CLIENT_ROUTES).sort()).toEqual(Object.keys(ROUTE_CLASSES).sort());
  });

  it('public routes match their contracts', async () => {
    const c = client();
    expect((await c.health()).status).toBe('ok');
    expect((await c.catalog()).labs.length).toBe(76); // Dummy Lab 00 + L01–L75
    const labs = await c.labs.list();
    expect(labs.map((l) => l.id)).toContain('lab-00');
    expect((await c.labs.get('lab-00')).id).toBe('lab-00');
    expect((await c.labs.source('lab-00')).files.length).toBeGreaterThan(0);
    expect((await c.labs.preflight('lab-00')).labId).toBe('lab-00');
    expect((await c.auth.session()).authenticated).toBe(false);
  });

  it('error responses match the error contract', async () => {
    const c = client();
    expect(await code(c.runs.start('lab-00', { input: { message: 'hi' } }))).toBe('401 UNAUTHORIZED');
    expect(await code(c.labs.get('lab-99'))).toBe('404 NOT_FOUND');
    await c.auth.login({ username: 'learner' });
    const invalid = await c.runs.start('lab-00', { input: { message: '' } }).catch((e: ApiClientError) => e);
    expect(invalid).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect((invalid as ApiClientError).details?.length).toBeGreaterThan(0);
    expect(await code(c.runs.get('00000000-0000-4000-8000-000000000000'))).toBe('404 NOT_FOUND');
  });

  it('a signed-in learner runs a lab end to end through the SDK, and resumes the stream', async () => {
    const c = client();
    const session = await c.auth.login({ username: 'learner' });
    expect(session.authenticated).toBe(true);
    const example = (await c.labs.get('lab-00')).exampleInput as Record<string, unknown>;
    const started = await c.runs.start('lab-00', { input: example });
    const events: ExecutionEvent[] = [];
    await c.runs.events(started.runId, (e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'succeeded' });
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect((await c.runs.get(started.runId)).status).toBe('succeeded');
    // A second subscriber after completion replays the whole run from the server buffer.
    const replay: number[] = [];
    await c.runs.events(started.runId, (e) => replay.push(e.seq));
    expect(replay).toEqual(events.map((e) => e.seq));
  });

  it('approval and cancel routes match their contracts, with the run token', async () => {
    const c = client();
    await c.auth.login({ username: 'learner' });
    const input = { ...((await c.labs.get('lab-15')).exampleInput as Record<string, unknown>), userDecision: 'ask' };
    const started = await c.runs.start('lab-15', { input });
    const ctrl = new AbortController();
    let approvalId = '';
    await c.runs
      .events(
        started.runId,
        (e) => {
          if (e.type === 'approval-request') {
            approvalId = e.approvalId;
            ctrl.abort();
          }
        },
        ctrl.signal,
      )
      .catch(() => undefined);
    expect(approvalId).not.toBe('');
    expect(await code(c.runs.decide(started.runId, 'wrong-token', approvalId, 'approve'))).toBe('403 FORBIDDEN');
    expect((await c.runs.decide(started.runId, started.runToken, approvalId, 'decline')).approvalId).toBe(approvalId);
    const second = await c.runs.start('lab-00', { input: { message: 'slow', delayMs: 1_000, simulateFailure: false } });
    expect((await c.runs.cancel(second.runId, second.runToken)).runId).toBe(second.runId);
    expect((await c.auth.logout()).authenticated).toBe(false);
  });
});
