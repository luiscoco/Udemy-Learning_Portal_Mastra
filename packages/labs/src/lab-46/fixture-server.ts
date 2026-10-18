import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { noopLogger } from '@mastra/core/logger';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { LABS } from '@mlp/lab-catalog';
import { z } from 'zod';

export const FIXTURE = { id: 'course-fixture', name: 'Course fixture server', version: '1.0.0', path: '/mcp' } as const;
export const FIXTURE_INSTRUCTIONS =
  'Read-only course metadata for the Mastra Learning Platform. Use course_info for an overview and lab_title to look up one lab.';

/** The example server: two read-only tools over the course catalog. */
export function createFixtureMcpServer(): MCPServer {
  const courseInfo = createTool({
    id: 'course_info',
    description: 'Returns the course name and the number of labs (read-only).',
    inputSchema: z.object({}),
    outputSchema: z.object({ course: z.string(), labs: z.number() }),
    execute: async () => ({ course: 'Mastra Learning Platform', labs: LABS.filter((l) => l.number >= 1).length }),
  });
  const labTitle = createTool({
    id: 'lab_title',
    description: 'Returns the title of one lab by number (read-only).',
    inputSchema: z.object({ number: z.number().int().min(1).max(75) }),
    outputSchema: z.object({ number: z.number(), title: z.string() }),
    execute: async ({ number }) => ({ number, title: LABS.find((l) => l.number === number)?.title ?? 'unknown' }),
  });
  const server = new MCPServer({
    id: FIXTURE.id,
    name: FIXTURE.name,
    version: FIXTURE.version,
    description: 'Local example MCP server for the Mastra Learning Platform labs',
    instructions: FIXTURE_INSTRUCTIONS,
    tools: { course_info: courseInfo, lab_title: labTitle },
  });
  server.__setLogger(noopLogger);
  return server;
}

/** A Node HTTP server that tracks its sockets, so teardown can prove nothing stays open. */
class TrackedHttp {
  readonly sockets = new Set<Socket>();
  constructor(readonly server: http.Server) {
    server.on('connection', (s) => {
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
    });
  }
  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    return (this.server.address() as AddressInfo).port;
  }
  async close(): Promise<void> {
    const closing = [...this.sockets].map(
      (s) => new Promise<void>((resolve) => (s.destroyed && !this.sockets.has(s) ? resolve() : s.once('close', () => resolve()))),
    );
    for (const s of this.sockets) s.destroy();
    await Promise.all(closing);
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

export interface LocalFixture {
  /** Healthy MCP endpoint, e.g. http://127.0.0.1:51234/mcp */
  url: string;
  host: string;
  /** Accepts connections and never answers. */
  silentUrl: string;
  /** A loopback port that was bound and closed again (nothing listens). */
  closedUrl: string;
  openSockets(): number;
  listening(): boolean;
  close(): Promise<void>;
}

export async function startLocalFixture(): Promise<LocalFixture> {
  const mcp = createFixtureMcpServer();
  const main = new TrackedHttp(
    http.createServer((req, res) => {
      void mcp
        .startHTTP({
          url: new URL(req.url ?? '/', `http://${host}`),
          httpPath: FIXTURE.path,
          req,
          res,
          options: {
            enableDnsRebindingProtection: true,
            allowedHosts: ['127.0.0.1'],
          },
        })
        .catch(() => {
          if (!res.headersSent) res.writeHead(500).end();
        });
    }),
  );
  const silent = new TrackedHttp(http.createServer(() => {}));
  const closed = new TrackedHttp(http.createServer());
  const host = `127.0.0.1:${await main.listen()}`;
  const silentPort = await silent.listen();
  const closedPort = await closed.listen();
  await closed.close();
  return {
    url: `http://${host}${FIXTURE.path}`,
    host,
    silentUrl: `http://127.0.0.1:${silentPort}${FIXTURE.path}`,
    closedUrl: `http://127.0.0.1:${closedPort}${FIXTURE.path}`,
    openSockets: () => main.sockets.size + silent.sockets.size,
    listening: () => main.server.listening || silent.server.listening,
    async close() {
      await Promise.all([main.close(), silent.close()]);
      await mcp.close().catch(() => undefined);
    },
  };
}
