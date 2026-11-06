import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { ROUTE_CLASSES } from './route-classes.js';
import { signIn } from './test-auth.js';
import { testMemoryDir } from '@mlp/labs/test-memory';
import { emptyProgress } from '@mlp/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Layer = { name: string; route?: { path: string; methods: Record<string, boolean> }; handle?: any };

/** Every registered API route as "METHOD /path": top-level routes plus the routes of each recorded mount. */
export function listRoutes(api: ApiApp): string[] {
  const stack = (api.app as unknown as { router: { stack: Layer[] } }).router.stack;
  const routes: string[] = [];
  const add = (base: string, layers: Layer[]) => {
    for (const l of layers)
      if (l.route)
        for (const m of Object.keys(l.route.methods))
          routes.push(`${m.toUpperCase()} ${(base + l.route.path).replace(/\/$/, '') || '/'}`);
  };
  add('', stack);
  for (const { base, router } of api.mounts) add(base, (router as unknown as { stack: Layer[] }).stack);
  return routes.filter((r) => r.split(' ')[1]!.startsWith('/api')).sort();
}

let api: ApiApp;
let server: Server;
let base: string;
let alice: string;
let bob: string;

beforeAll(async () => {
  api = createApp({
    config: parseConfig({ NODE_ENV: 'test', AUTH_DEV_USERS: 'alice,bob', AUTH_LOGIN_RATE_MAX: '100' }),
    logger: createLogger('silent'),
    memoryDir: testMemoryDir('api-route-audit'),
  });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await signIn(base, 'alice');
  bob = await signIn(base, 'bob');
});
afterAll(async () => {
  await api.runner.dispose();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const json = { 'content-type': 'application/json' };
async function start(cookie: string, labId: string, input: Record<string, unknown>) {
  const res = await fetch(`${base}/api/labs/${labId}/runs`, {
    method: 'POST',
    headers: { ...json, cookie },
    body: JSON.stringify({ input }),
  });
  expect(res.status).toBe(202);
  return (await res.json()) as { runId: string; runToken: string };
}

describe('route audit (L62)', () => {
  it('classifies every registered API route, and lists no route that is gone', () => {
    const registered = listRoutes(api);
    expect(registered).toEqual(Object.keys(ROUTE_CLASSES).sort());
    // Every router in the app was mounted through mount(), so none can hide from this audit.
    const routers = (api.app as unknown as { router: { stack: Layer[] } }).router.stack.filter((l) => l.name === 'router');
    expect(routers).toHaveLength(api.mounts.length);
  });

  it('public routes answer without a session and carry no learner data', async () => {
    for (const path of [
      '/api/health',
      '/api/catalog',
      '/api/labs',
      '/api/labs/lab-00',
      '/api/labs/lab-00/source',
      '/api/labs/lab-00/preflight',
    ]) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(200);
      const text = await res.text();
      expect(text, path).not.toMatch(/dev:alice|dev:bob/);
    }
    expect(await (await fetch(`${base}/api/auth/session`)).json()).toMatchObject({ authenticated: false, principal: null });
  });

  it('every tenant route refuses anonymous callers (401) and other learners (404)', async () => {
    // A run of Alice's that pauses for an approval, so every run route has something to act on.
    const a = await start(alice, 'lab-15', { ...(await labExample('lab-15')), userDecision: 'ask' });
    const approvalId = await waitForApproval(a.runId, alice);
    const lab00Input = await labExample('lab-00');
    expect(approvalId).not.toBe('');
    const calls: Record<string, (cookie?: string) => Promise<Response>> = {
      'POST /api/tutor/answer': (cookie) =>
        fetch(`${base}/api/tutor/answer`, {
          method: 'POST',
          headers: { ...json, 'x-run-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ labId: 'lab-00', question: 'Give me a hint', mode: 'offline' }),
        }),
      'GET /api/progress': (cookie) =>
        fetch(`${base}/api/progress`, {
          headers: { ...json, 'x-progress-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
        }),
      'POST /api/progress/import': (cookie) =>
        fetch(`${base}/api/progress/import`, {
          method: 'POST',
          headers: { ...json, 'x-progress-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ records: [emptyProgress('lab-01')] }),
        }),
      'POST /api/progress/:labId': (cookie) =>
        fetch(`${base}/api/progress/lab-00`, {
          method: 'POST',
          headers: { ...json, 'x-progress-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ baseRevision: 0, record: emptyProgress('lab-00') }),
        }),
      'POST /api/progress/:labId/reset': (cookie) =>
        fetch(`${base}/api/progress/lab-00/reset`, {
          method: 'POST',
          headers: { ...json, 'x-progress-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ baseRevision: 1 }),
        }),
      'POST /api/labs/:labId/runs': (cookie) =>
        fetch(`${base}/api/labs/lab-00/runs`, {
          method: 'POST',
          headers: { ...json, ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ input: lab00Input }),
        }),
      'GET /api/runs/:runId': (cookie) => fetch(`${base}/api/runs/${a.runId}`, { headers: cookie ? { cookie } : {} }),
      'GET /api/runs': (cookie) =>
        fetch(`${base}/api/runs?labId=lab-15`, { headers: { 'x-run-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) } }),
      'POST /api/runs/:runId/recover': (cookie) =>
        fetch(`${base}/api/runs/${a.runId}/recover`, {
          method: 'POST',
          headers: { 'x-run-subject': 'dev%3Aalice', ...(cookie ? { cookie } : {}) },
        }),
      'GET /api/runs/:runId/events': (cookie) =>
        fetch(`${base}/api/runs/${a.runId}/events`, {
          headers: cookie ? { cookie } : {},
          signal: AbortSignal.timeout(300),
        }).catch(() => new Response(null, { status: 200 })),
      'POST /api/runs/:runId/approvals/:approvalId': (cookie) =>
        fetch(`${base}/api/runs/${a.runId}/approvals/${approvalId}`, {
          method: 'POST',
          headers: { ...json, 'x-run-token': a.runToken, ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ decision: 'approve' }),
        }),
      'POST /api/runs/:runId/cancel': (cookie) =>
        fetch(`${base}/api/runs/${a.runId}/cancel`, {
          method: 'POST',
          headers: { 'x-run-token': a.runToken, ...(cookie ? { cookie } : {}) },
        }),
    };
    const tenantRoutes = Object.entries(ROUTE_CLASSES)
      .filter(([, c]) => c === 'tenant')
      .map(([k]) => k);
    expect(Object.keys(calls).sort()).toEqual(tenantRoutes.sort());
    for (const key of tenantRoutes) {
      expect((await calls[key]!()).status, `${key} anonymous`).toBe(401);
      if (key !== 'POST /api/labs/:labId/runs') expect((await calls[key]!(bob)).status, `${key} as bob`).toBe(404);
    }
    // The owner still succeeds on every route (approval, then cancel last).
    for (const key of tenantRoutes) expect((await calls[key]!(alice)).status, `${key} as alice`).toBeLessThan(300);
  });
});

/** Reads the run's event stream until its approval request arrives, then closes the stream. */
async function waitForApproval(runId: string, cookie: string): Promise<string> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/runs/${runId}/events`, { headers: { cookie }, signal: ctrl.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return '';
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines)
        if (line.startsWith('data: ')) {
          const e = JSON.parse(line.slice(6)) as { type: string; approvalId?: string };
          if (e.type === 'approval-request' && e.approvalId) return e.approvalId;
        }
    }
  } finally {
    ctrl.abort();
  }
}

async function labExample(labId: string): Promise<Record<string, unknown>> {
  return ((await (await fetch(`${base}/api/labs/${labId}`)).json()) as { exampleInput: Record<string, unknown> }).exampleInput;
}
