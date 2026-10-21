import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  DevIdentityProvider,
  SessionManager,
  SESSION_COOKIE,
  parseCookies,
  serializeCookie,
  clearCookie,
  sameOriginOrAbsent,
  randomSecret,
} from '@mlp/auth';
import { LoginRequestSchema } from '@mlp/contracts';

/** A disposable, loopback-only fixture. These are real HTTP routes, with the platform's auth primitives. */
export async function startDemo(opts: { users: string[]; password?: string; ttlMs: number; signal: AbortSignal }) {
  let clock = 1_000_000;
  const secret = randomSecret();
  const provider = new DevIdentityProvider(opts);
  const sessions = new SessionManager({ secret, ttlMs: opts.ttlMs, now: () => clock });
  const runs = new Map<string, string>();
  const logs: string[] = [];
  const server = createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      // Log only an operation and status, never a body, cookie, passcode or signing secret.
      logs.push(`${req.method} ${req.url} ${status}`);
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const session = sessions.verify(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (req.method === 'POST' && !sameOriginOrAbsent(req.headers.origin, req.headers.host)) {
      reply(403, { error: 'Cross-origin request refused' });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      void (async () => {
        let raw = '';
        for await (const chunk of req) {
          raw += String(chunk);
          if (Buffer.byteLength(raw) > 4096) {
            reply(413, { error: 'Body too large' });
            return;
          }
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          reply(400, { error: 'Invalid JSON' });
          return;
        }
        const parsed = LoginRequestSchema.safeParse(body);
        const principal = parsed.success ? await provider.authenticate(parsed.data) : null;
        if (!principal) {
          reply(401, { error: 'Invalid user name or passcode' });
          return;
        }
        if (session) sessions.revoke(session.sid);
        const created = sessions.create(principal);
        res.setHeader('set-cookie', serializeCookie(created.cookieValue, { maxAgeSeconds: opts.ttlMs / 1000, secure: false }));
        reply(200, { authenticated: true });
      })().catch(() => {
        if (!res.writableEnded) reply(500, { error: 'Demo request failed' });
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/auth/logout') {
      if (session) sessions.revoke(session.sid);
      res.setHeader('set-cookie', clearCookie(false));
      reply(200, { authenticated: false });
      return;
    }
    if (!session) {
      reply(401, { error: 'Sign in to run labs' });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/runs') {
      const id = randomUUID();
      runs.set(id, session.principal.sub);
      reply(202, { runId: id });
      return;
    }
    const id = req.url?.match(/^\/api\/runs\/([a-z0-9-]+)$/)?.[1];
    if (req.method === 'GET' && id && runs.get(id) === session.principal.sub) {
      reply(200, { status: 'succeeded' });
      return;
    }
    reply(404, { error: 'Unknown run' });
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
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
  if (opts.signal.aborted) abort();
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo | null)?.port ?? 0}`,
    logs,
    secret,
    get closed() {
      return !server.listening;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    async close() {
      opts.signal.removeEventListener('abort', abort);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
