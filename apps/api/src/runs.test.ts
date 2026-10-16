import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  ExecutionEventSchema,
  LabDefinitionSchema,
  LabSourceResponseSchema,
  PreflightResultSchema,
  StartRunResponseSchema,
  type ExecutionEvent,
} from '@mlp/contracts';
import { createApp, type ApiApp } from './app.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';

const SECRET = 'sk-test-NEVER-SHOWN-0123456789';
let api: ApiApp;
let server: Server;
let base: string;

beforeAll(async () => {
  api = createApp({
    config: parseConfig({ OPENAI_API_KEY: SECRET, NODE_ENV: 'test', SSE_DISCONNECT_GRACE_MS: '50', MAX_CONCURRENT_RUNS: '3' }),
    logger: createLogger('silent'),
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

async function startRun(labId: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/labs/${labId}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Reads an SSE stream until it closes (or `stopAfter` events), parsing `data:` payloads. */
async function readSse(url: string, opts: { stopAfter?: number; headers?: Record<string, string> } = {}) {
  const ctrl = new AbortController();
  const res = await fetch(url, { headers: { accept: 'text/event-stream', ...opts.headers }, signal: ctrl.signal });
  const events: ExecutionEvent[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (data) events.push(ExecutionEventSchema.parse(JSON.parse(data)));
        if (opts.stopAfter && events.length >= opts.stopAfter) {
          ctrl.abort();
          return { res, events, closedByServer: false };
        }
      }
    }
  } catch (err) {
    if (!ctrl.signal.aborted) throw err;
  }
  return { res, events, closedByServer: true };
}

describe('lab discovery', () => {
  it('lists labs and returns a schema-valid definition', async () => {
    const list = (await (await fetch(`${base}/api/labs`)).json()) as { id: string }[];
    expect(list.map((l) => l.id)).toContain('lab-00');
    const def = await (await fetch(`${base}/api/labs/lab-00`)).json();
    expect(LabDefinitionSchema.parse(def).title).toBe('Dummy Lab 00');
  });

  it('returns 404 for unknown labs', async () => {
    const res = await fetch(`${base}/api/labs/lab-98`);
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('serves readonly source with pinned versions', async () => {
    const body = LabSourceResponseSchema.parse(await (await fetch(`${base}/api/labs/lab-00/source`)).json());
    expect(body.files.map((f) => f.path)).toEqual(['run.ts', 'definition.ts', 'solution.md']);
    expect(body.files[0]?.code).toContain('export const lab00');
    expect(body.pinned['@mastra/core']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports preflight checks', async () => {
    const body = PreflightResultSchema.parse(await (await fetch(`${base}/api/labs/lab-00/preflight`)).json());
    expect(body.ready).toBe(true);
    expect(body.checks.map((c) => c.id)).toContain('mastra-installed');
  });
});

describe('run lifecycle over HTTP + SSE', () => {
  it('starts, streams every event type and closes after complete', async () => {
    const res = await startRun('lab-00', { input: { message: 'Hello SSE', delayMs: 0 } }, { 'x-correlation-id': 'course-demo-1' });
    expect(res.status).toBe(202);
    const start = StartRunResponseSchema.parse(await res.json());
    expect(start.correlationId).toBe('course-demo-1');
    expect(res.headers.get('x-request-id')).toBe(start.requestId);

    const { res: sse, events, closedByServer } = await readSse(`${base}/api/runs/${start.runId}/events`);
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    expect(closedByServer).toBe(true);
    expect(new Set(events.map((e) => e.type))).toEqual(
      new Set(['log', 'workflow-step', 'tool-start', 'tool-finish', 'token', 'result', 'complete']),
    );
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'succeeded' });
    expect(events.every((e) => e.correlationId === 'course-demo-1')).toBe(true);

    const snap = (await (await fetch(`${base}/api/runs/${start.runId}`)).json()) as { status: string };
    expect(snap.status).toBe('succeeded');
  });

  it('honours Last-Event-ID when reconnecting', async () => {
    const start = StartRunResponseSchema.parse(await (await startRun('lab-00', { input: { message: 'resume me', delayMs: 0 } })).json());
    await api.runner.waitFor(start.runId);
    const { events } = await readSse(`${base}/api/runs/${start.runId}/events`, { headers: { 'last-event-id': '5' } });
    expect(events[0]?.seq).toBe(6);
  });

  it('rejects invalid input with 422 and per-field details', async () => {
    const res = await startRun('lab-00', { input: { message: '', delayMs: 5000 } });
    expect(res.status).toBe(422);
    const body = ApiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.map((d) => d.path).sort()).toEqual(['input.delayMs', 'input.message']);
  });

  it('refuses live mode on an offline server with 503 NOT_CONFIGURED', async () => {
    const res = await startRun('lab-00', { input: { message: 'x' }, mode: 'live' });
    expect(res.status).toBe(503);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('NOT_CONFIGURED');
  });

  it('cancels a running run via the API', async () => {
    const start = StartRunResponseSchema.parse(
      await (await startRun('lab-00', { input: { message: 'a b c d e f g h', delayMs: 1000 } })).json(),
    );
    const streaming = readSse(`${base}/api/runs/${start.runId}/events`);
    await new Promise((r) => setTimeout(r, 100));
    const cancel = await fetch(`${base}/api/runs/${start.runId}/cancel`, { method: 'POST' });
    expect(cancel.status).toBe(200);
    const { events } = await streaming;
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'CANCELLED' });
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'cancelled' });
  });

  it('times out at the requested deadline', async () => {
    const start = StartRunResponseSchema.parse(
      await (await startRun('lab-00', { input: { message: 'a b c d e f', delayMs: 1000 }, timeoutMs: 300 })).json(),
    );
    const { events } = await readSse(`${base}/api/runs/${start.runId}/events`);
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'timeout' });
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'TIMEOUT' });
  });

  it('client disconnect closes the stream and frees the run after the grace period', async () => {
    const start = StartRunResponseSchema.parse(
      await (await startRun('lab-00', { input: { message: 'a b c d e f g h i j', delayMs: 1000 } })).json(),
    );
    const { closedByServer } = await readSse(`${base}/api/runs/${start.runId}/events`, { stopAfter: 1 });
    expect(closedByServer).toBe(false);
    const snap = await api.runner.waitFor(start.runId);
    expect(snap.status).toBe('cancelled');
    expect(api.runner.listenerCount(start.runId)).toBe(0);
  });

  it('enforces the concurrency limit with 429 retryable', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await startRun('lab-00', { input: { message: 'a b c d e f g h', delayMs: 1000 } });
      ids.push(StartRunResponseSchema.parse(await r.json()).runId);
    }
    const res = await startRun('lab-00', { input: { message: 'one more' } });
    expect(res.status).toBe(429);
    expect(ApiErrorSchema.parse(await res.json()).error).toMatchObject({ code: 'TOO_MANY_REQUESTS', retryable: true });
    for (const id of ids) await fetch(`${base}/api/runs/${id}/cancel`, { method: 'POST' });
    await Promise.all(ids.map((id) => api.runner.waitFor(id)));
  });

  it('returns 404 for unknown runs', async () => {
    expect((await fetch(`${base}/api/runs/nope/events`)).status).toBe(404);
    expect((await fetch(`${base}/api/runs/nope/cancel`, { method: 'POST' })).status).toBe(404);
  });
});

describe('secret isolation', () => {
  it('never returns the configured key from any endpoint or event', async () => {
    const start = StartRunResponseSchema.parse(await (await startRun('lab-00', { input: { message: 'leak?', delayMs: 0 } })).json());
    const { events } = await readSse(`${base}/api/runs/${start.runId}/events`);
    const bodies = await Promise.all(
      ['/api/health', '/api/catalog', '/api/labs', '/api/labs/lab-00', '/api/labs/lab-00/source', '/api/labs/lab-00/preflight'].map(
        async (p) => (await fetch(base + p)).text(),
      ),
    );
    for (const text of [...bodies, JSON.stringify(events)]) expect(text).not.toContain(SECRET);
  });
});
