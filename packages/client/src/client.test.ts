import { describe, expect, it } from 'vitest';
import type { ExecutionEventPayload } from '@mlp/contracts';
import { ApiClientError, createApiClient } from './index.js';

type Call = { url: string; init: RequestInit };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const event = (seq: number, p: ExecutionEventPayload) => ({
  ...p,
  runId: 'r1',
  correlationId: 'c1',
  seq,
  timestamp: new Date(0).toISOString(),
});
const frame = (e: { seq: number; type: string }) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
/** An SSE body delivered in awkward chunks (split inside frames), optionally ending early. */
function sse(frames: string[], chunk = 7): Response {
  const text = frames.join('');
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(ctrl) {
        for (let i = 0; i < text.length; i += chunk) ctrl.enqueue(enc.encode(text.slice(i, i + chunk)));
        ctrl.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const EVENTS = [
  event(0, { type: 'log', level: 'info', message: 'start' }),
  event(1, { type: 'token', text: 'Echo' }),
  event(2, { type: 'token', text: ' hi' }),
  event(3, { type: 'complete', status: 'succeeded', durationMs: 5 }),
];

describe('createApiClient', () => {
  it('validates success bodies and rejects contract drift', async () => {
    const body = {
      status: 'ok',
      service: 'mlp-api',
      version: '0.1.0',
      uptimeSeconds: 3,
      mode: 'offline',
      mastraVersion: '1.78.0',
      timestamp: new Date(0).toISOString(),
    };
    const health = await createApiClient({ fetch: fakeFetch(() => json(body)).fetch }).health();
    expect(health).toEqual(body);
    const missing = await createApiClient({ fetch: fakeFetch(() => json({ ...body, timestamp: undefined })).fetch })
      .health()
      .catch((e: ApiClientError) => e);
    expect(missing).toMatchObject({ code: 'CONTRACT', details: [{ path: 'timestamp' }] });
    const drift = fakeFetch(() => json({ runId: 'r1', labId: 'lab-00' })); // a snapshot without status
    const err = await createApiClient({ fetch: drift.fetch })
      .runs.get('r1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('CONTRACT');
    expect((err as ApiClientError).message).toMatch(/does not match its contract/);
  });

  it('turns error bodies, foreign errors and network failures into typed errors', async () => {
    const api = (h: () => Response | Promise<Response>) => createApiClient({ fetch: fakeFetch(h).fetch });
    const typed = await api(() =>
      json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid input',
            details: [{ path: 'input.message', message: 'Required' }],
            requestId: 'req-1',
          },
        },
        422,
      ),
    )
      .runs.start('lab-00', { input: {} })
      .catch((e: ApiClientError) => e);
    expect(typed).toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
      requestId: 'req-1',
      details: [{ path: 'input.message' }],
    });
    const foreign = await api(() => new Response('<html>bad gateway</html>', { status: 502 }))
      .labs.list()
      .catch((e: ApiClientError) => e);
    expect(foreign).toMatchObject({ code: 'INTERNAL', status: 502 });
    const down = await api(() => Promise.reject(new TypeError('fetch failed')))
      .labs.list()
      .catch((e: ApiClientError) => e);
    expect(down).toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('refuses credential options and never sends credential headers', async () => {
    expect(() => createApiClient({ apiKey: 'sk-test' } as never)).toThrow(/unsupported option "apiKey"/);
    const { calls, fetch } = fakeFetch((url) =>
      url.endsWith('/cancel') ? json({ runId: 'x' }) : json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404),
    );
    const api = createApiClient({ fetch, baseUrl: 'http://127.0.0.1:1/' });
    await api.labs.get('lab-00').catch(() => undefined);
    await api.runs.cancel('r1', 'tok-123').catch(() => undefined);
    expect(calls.map((c) => c.url)).toEqual(['http://127.0.0.1:1/api/labs/lab-00', 'http://127.0.0.1:1/api/runs/r1/cancel']);
    for (const c of calls) {
      const names = Object.keys((c.init.headers ?? {}) as Record<string, string>).map((h) => h.toLowerCase());
      expect(names.filter((h) => /authorization|api-key|apikey|cookie/.test(h))).toEqual([]);
      expect(c.init.credentials).toBe('same-origin');
    }
    expect((calls[1]!.init.headers as Record<string, string>)['x-run-token']).toBe('tok-123');
    expect((calls[0]!.init.headers as Record<string, string>)['x-run-token']).toBeUndefined();
  });
});

describe('runs.events', () => {
  it('parses frames split across chunks and stops at complete', async () => {
    const { fetch } = fakeFetch(() => sse(EVENTS.map(frame), 5));
    const got: number[] = [];
    await createApiClient({ fetch }).runs.events('r1', (e) => got.push(e.seq));
    expect(got).toEqual([0, 1, 2, 3]);
  });

  it('resumes after a drop with Last-Event-ID and delivers no event twice', async () => {
    const reconnects: number[] = [];
    const { calls, fetch } = fakeFetch(
      (_url, _init, n) => (n === 1 ? sse(EVENTS.slice(0, 2).map(frame)) : sse(EVENTS.map(frame))), // the server replays from the start
    );
    const got: number[] = [];
    await createApiClient({ fetch, reconnect: { baseDelayMs: 1 }, onReconnect: (_a, last) => reconnects.push(last) }).runs.events(
      'r1',
      (e) => got.push(e.seq),
    );
    expect(got).toEqual([0, 1, 2, 3]);
    expect(reconnects).toEqual([1]);
    expect((calls[1]!.init.headers as Record<string, string>)['last-event-id']).toBe('1');
  });

  it('gives up after the bounded reconnects, and rejects a malformed event', async () => {
    const dropping = fakeFetch(() => sse(EVENTS.slice(0, 1).map(frame)));
    const lost = await createApiClient({ fetch: dropping.fetch, reconnect: { max: 2, baseDelayMs: 1 } })
      .runs.events('r1', () => undefined)
      .catch((e: ApiClientError) => e);
    expect(lost).toMatchObject({ code: 'NETWORK' });
    expect(dropping.calls).toHaveLength(3);
    const bad = fakeFetch(() => sse([frame(EVENTS[0]!), `id: 1\ndata: ${JSON.stringify({ type: 'mystery', seq: 1 })}\n\n`]));
    const drift = await createApiClient({ fetch: bad.fetch })
      .runs.events('r1', () => undefined)
      .catch((e: ApiClientError) => e);
    expect(drift).toMatchObject({ code: 'CONTRACT' });
  });
});
