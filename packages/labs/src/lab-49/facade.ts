import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { noopLogger } from '@mastra/core/logger';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import type { Candidate, Risk } from './registry.js';

export const FACADE = { id: 'course-tools-facade', name: 'Course tools façade', version: '1.0.0', path: '/mcp' } as const;
export const LIMITS = { timeoutMs: 2_000, maxResultBytes: 8_192, maxBodyBytes: 65_536 } as const;

export interface Refusal {
  id: string;
  source: string;
  risk: Risk;
  reason: 'not-allowlisted' | 'side-effect' | 'personal-data';
  why: string;
}

/** Exposed = allowlisted AND read-only. Everything else is refused with a reason. */
export function planExposure(candidates: readonly Candidate[], allowlist: readonly string[]) {
  const exposed: Candidate[] = [];
  const refused: Refusal[] = [];
  for (const c of candidates) {
    const base = { id: c.id, source: c.source, risk: c.risk, why: c.why };
    if (c.risk !== 'read-only') refused.push({ ...base, reason: c.risk });
    else if (!allowlist.includes(c.id)) refused.push({ ...base, reason: 'not-allowlisted' });
    else exposed.push(c);
  }
  const known = new Set(candidates.map((c) => c.id));
  return { exposed, refused, unknownIds: allowlist.filter((id) => !known.has(id)) };
}

export interface AuditEntry {
  seq: number;
  tool: string;
  status: 'ok' | 'error' | 'timeout' | 'too-large';
  ms: number;
  /** Size of the arguments in bytes; the values themselves are not recorded. */
  argBytes: number;
}

class FacadeError extends Error {}

/** A façade tool: same schemas as the original, plus annotations, a timeout, a result cap and an audit entry. */
export function wrapTool(c: Candidate, audit: AuditEntry[]) {
  return createTool({
    id: c.id,
    description: c.tool.description ?? c.id,
    inputSchema: c.tool.inputSchema,
    outputSchema: c.tool.outputSchema,
    mcp: {
      annotations: { title: c.id, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    execute: async (input: unknown, context: unknown) => {
      const t0 = performance.now();
      const record = (status: AuditEntry['status']) =>
        audit.push({
          seq: audit.length + 1,
          tool: c.id,
          status,
          ms: Math.round(performance.now() - t0),
          argBytes: Buffer.byteLength(JSON.stringify(input ?? {})),
        });
      let timer: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          c.tool.execute!(input as never, context as never),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new FacadeError(`timed out after ${LIMITS.timeoutMs} ms`)), LIMITS.timeoutMs);
          }),
        ]);
        if (Buffer.byteLength(JSON.stringify(result ?? null)) > LIMITS.maxResultBytes) {
          record('too-large');
          throw new FacadeError(`result larger than ${LIMITS.maxResultBytes} bytes`);
        }
        record('ok');
        return result;
      } catch (e) {
        if (!(e instanceof FacadeError && e.message.startsWith('result'))) record(e instanceof FacadeError ? 'timeout' : 'error');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

export interface Facade {
  url: string;
  host: string;
  /** Bearer token for this run only. Never put it in output or logs. */
  token: string;
  audit: AuditEntry[];
  requests: { total: number; unauthorized: number; tooLarge: number };
  openSockets(): number;
  listening(): boolean;
  close(): Promise<void>;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Serves the exposed tools on loopback with a per-run bearer token, a body limit and DNS-rebinding protection. */
export async function startFacade(exposed: readonly Candidate[]): Promise<Facade> {
  const audit: AuditEntry[] = [];
  const server = new MCPServer({
    id: FACADE.id,
    name: FACADE.name,
    version: FACADE.version,
    description: 'Read-only course tools published over MCP',
    instructions: 'Read-only calculation and catalog tools. Nothing here changes data or reveals customer information.',
    tools: Object.fromEntries(exposed.map((c) => [c.id, wrapTool(c, audit)])),
  });
  server.__setLogger(noopLogger);
  const token = randomBytes(24).toString('base64url');
  const requests = { total: 0, unauthorized: 0, tooLarge: 0 };
  const sockets = new Set<Socket>();
  let host = '';
  const httpServer = http.createServer((req, res) => {
    requests.total += 1;
    if (!sameSecret(req.headers.authorization ?? '', `Bearer ${token}`)) {
      requests.unauthorized += 1;
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' }).end('{"error":"unauthorized"}');
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > LIMITS.maxBodyBytes) {
      requests.tooLarge += 1;
      res.writeHead(413, { 'content-type': 'application/json' }).end('{"error":"request too large"}');
      return;
    }
    void server
      .startHTTP({
        url: new URL(req.url ?? '/', `http://${host}`),
        httpPath: FACADE.path,
        req,
        res,
        options: { enableDnsRebindingProtection: true, allowedHosts: ['127.0.0.1'] },
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500).end();
      });
  });
  httpServer.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  host = `127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  return {
    url: `http://${host}${FACADE.path}`,
    host,
    token,
    audit,
    requests,
    openSockets: () => sockets.size,
    listening: () => httpServer.listening,
    async close() {
      const closing = [...sockets].map((s) => new Promise<void>((r) => s.once('close', () => r())));
      for (const s of sockets) s.destroy();
      await Promise.all(closing);
      if (httpServer.listening) await new Promise<void>((r) => httpServer.close(() => r()));
      await server.close().catch(() => undefined);
    },
  };
}
