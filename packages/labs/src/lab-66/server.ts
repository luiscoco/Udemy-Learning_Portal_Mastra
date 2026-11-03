import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { ApiErrorCode, ExecutionEvent } from '@mlp/contracts';
import { LabError, LabRegistry, LabRunner, toCanonicalError, type LabImplementation } from '@mlp/lab-engine';
import { lab00 } from '../lab-00/run.js';

/** Response drift the learner can inject: a snapshot without `status`, or an event of an unknown type. */
export const DRIFTS = ['none', 'snapshot', 'event'] as const;
export type Drift = (typeof DRIFTS)[number];

export interface RequestRecord {
  method: string;
  path: string;
  /** Header names only: values are never recorded. */
  headers: string[];
  credentialHeaders: string[];
  secretLikeValues: number;
  lastEventId?: string;
}

const STATUS: Partial<Record<ApiErrorCode, number>> = {
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  CONFLICT: 409,
};
const CREDENTIAL_HEADER =
  /^(authorization|proxy-authorization|x-api-key|api-key|apikey|openai-api-key|anthropic-api-key|x-goog-api-key)$/i;
/** Provider-key-like values (OpenAI, Anthropic, Google): flagged, counted, never stored. */
const SECRET_LIKE = /\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,})\b/;

/**
 * A disposable loopback API with the platform's run routes, backed by the real LabRunner and Dummy Lab 00.
 * Only what the lab needs: GET /api/labs/:id, POST /api/labs/:id/runs, GET /api/runs/:id,
 * GET /api/runs/:id/events (SSE with Last-Event-ID) and POST /api/runs/:id/cancel (X-Run-Token).
 */
export async function startDemoApi(opts: { drift: Drift; dropAfterEvents: number; signal: AbortSignal }) {
  const runner = new LabRunner({
    registry: new LabRegistry([lab00 as unknown as LabImplementation<unknown, unknown, unknown>]),
    services: {},
    liveEnabled: false,
    disconnectGraceMs: 5_000,
  });
  const requests: RequestRecord[] = [];
  const sockets = new Set<Socket>();
  let streams = 0;

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, err: unknown) => {
    const c = toCanonicalError(err);
    send(res, STATUS[c.code as ApiErrorCode] ?? 500, {
      error: { code: c.code, message: c.message, ...(c.details ? { details: c.details } : {}), retryable: c.retryable },
    });
  };
  const readJson = (req: IncomingMessage) =>
    new Promise<unknown>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > 64_000) reject(new LabError('BAD_REQUEST', 'Body too large'));
        else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          reject(new LabError('BAD_REQUEST', 'Body is not JSON'));
        }
      });
      req.on('error', reject);
    });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const names = Object.keys(req.headers);
    requests.push({
      method: req.method ?? 'GET',
      path: url.pathname,
      headers: names,
      credentialHeaders: names.filter((h) => CREDENTIAL_HEADER.test(h)),
      secretLikeValues: Object.values(req.headers).filter((v) => SECRET_LIKE.test(String(v))).length,
      ...(req.headers['last-event-id'] ? { lastEventId: String(req.headers['last-event-id']) } : {}),
    });
    void (async () => {
      try {
        const parts = url.pathname.split('/').filter(Boolean); // api, labs|runs, id, sub
        if (parts[0] !== 'api') throw new LabError('NOT_FOUND', 'Unknown route');
        if (parts[1] === 'labs' && req.method === 'GET' && parts.length === 3) return send(res, 200, lab00ById(parts[2]!));
        if (parts[1] === 'labs' && req.method === 'POST' && parts[3] === 'runs') {
          const body = await readJson(req);
          const started = runner.start(parts[2]!, body);
          return send(res, 202, {
            runId: started.runId,
            runToken: started.runToken,
            correlationId: started.correlationId,
            requestId: `req-${requests.length}`,
          });
        }
        if (parts[1] === 'runs' && req.method === 'GET' && parts.length === 3) {
          const snap = runner.get(parts[2]!);
          if (!snap) throw new LabError('NOT_FOUND', `Unknown run "${parts[2]}"`);
          if (opts.drift === 'snapshot') {
            const { status: _dropped, ...drifted } = snap;
            return send(res, 200, drifted);
          }
          return send(res, 200, snap);
        }
        if (parts[1] === 'runs' && req.method === 'POST' && parts[3] === 'cancel') {
          runner.authorize(parts[2]!, req.headers['x-run-token'] as string | undefined);
          return send(res, 200, runner.cancel(parts[2]!));
        }
        if (parts[1] === 'runs' && req.method === 'GET' && parts[3] === 'events') return stream(parts[2]!, req, res);
        throw new LabError('NOT_FOUND', 'Unknown route');
      } catch (err) {
        if (!res.headersSent) fail(res, err);
      }
    })();
  });
  const lab00ById = (id: string) => {
    if (id !== 'lab-00') throw new LabError('NOT_FOUND', `Unknown lab "${id}"`);
    return lab00.definition;
  };

  function stream(runId: string, req: IncomingMessage, res: ServerResponse) {
    if (!runner.get(runId)) throw new LabError('NOT_FOUND', `Unknown run "${runId}"`);
    const connection = ++streams;
    const after = Number(req.headers['last-event-id'] ?? -1);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    let sent = 0;
    // subscribe() replays buffered events synchronously, so `write` can need to stop before subscribe returns.
    let unsubscribe: () => void = () => undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      unsubscribe();
    };
    const write = (e: ExecutionEvent) => {
      if (stopped || res.writableEnded || res.destroyed) return;
      res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      sent += 1;
      if (opts.drift === 'event' && sent === 1)
        res.write(
          `id: ${e.seq + 1000}\nevent: mystery\ndata: ${JSON.stringify({ ...e, type: 'mystery', seq: e.seq + 1000 })}\n\n`,
        );
      if (e.type === 'complete') {
        stop();
        res.end();
      } else if (connection === 1 && opts.dropAfterEvents > 0 && sent >= opts.dropAfterEvents) {
        stop();
        // The connection ends before `complete` (end() flushes what was written; destroy() would discard it):
        // the client must resume with Last-Event-ID.
        res.end();
      }
    };
    unsubscribe = runner.subscribe(runId, write, Number.isFinite(after) ? after : -1);
    if (stopped) unsubscribe();
    req.on('close', stop);
  }

  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const abort = () => {
    server.closeAllConnections();
    server.close();
  };
  opts.signal.addEventListener('abort', abort, { once: true });

  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    get streams() {
      return streams;
    },
    async close() {
      opts.signal.removeEventListener('abort', abort);
      await runner.dispose();
      server.closeAllConnections();
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // Socket 'close' events fire asynchronously after destroy(); wait for them (bounded).
      for (let i = 0; i < 50 && sockets.size > 0; i++) await new Promise((r) => setTimeout(r, 10));
      return { closed: !server.listening, openSockets: sockets.size };
    },
  };
}
