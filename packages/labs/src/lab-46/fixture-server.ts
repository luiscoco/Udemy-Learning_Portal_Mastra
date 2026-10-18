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

export type FixtureCatalog = 'basic' | 'full';
export interface FixtureOptions {
  /** basic: course_info and lab_title (L46). full: adds search_labs and the destructive reset_progress. */
  catalog?: FixtureCatalog;
  /** Called on every server-side tool execution. */
  onCall?: (toolName: string) => void;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const courseLabs = () => LABS.filter((l) => l.number >= 1);

/** The example server: read-only tools over the course catalog (plus one destructive no-op in the full catalog). */
export function createFixtureMcpServer(options: FixtureOptions = {}): MCPServer {
  const counted = (name: string) => options.onCall?.(name);
  const courseInfo = createTool({
    id: 'course_info',
    description: 'Returns the course name and the number of labs (read-only).',
    inputSchema: z.object({}),
    outputSchema: z.object({ course: z.string(), labs: z.number() }),
    mcp: { annotations: { title: 'Course overview', ...READ_ONLY } },
    execute: async () => {
      counted('course_info');
      return { course: 'Mastra Learning Platform', labs: courseLabs().length };
    },
  });
  const labTitle = createTool({
    id: 'lab_title',
    description: 'Returns the title of one lab by number (read-only).',
    inputSchema: z.object({ number: z.number().int().min(1).max(75).describe('Lab number, 1 to 75') }),
    outputSchema: z.object({ number: z.number(), title: z.string() }),
    mcp: { annotations: { title: 'Lab title', ...READ_ONLY } },
    execute: async ({ number }) => {
      counted('lab_title');
      return { number, title: LABS.find((l) => l.number === number)?.title ?? 'unknown' };
    },
  });
  const tools: Record<string, ReturnType<typeof createTool>> = { course_info: courseInfo, lab_title: labTitle };
  if (options.catalog === 'full') {
    tools.search_labs = createTool({
      id: 'search_labs',
      description: 'Finds labs whose title contains the query, case-insensitively (read-only).',
      inputSchema: z.object({
        query: z.string().trim().min(2).max(60).describe('Words to look for in lab titles'),
        limit: z.number().int().min(1).max(10).default(3).describe('Maximum number of matches'),
      }),
      outputSchema: z.object({ matches: z.array(z.object({ number: z.number(), title: z.string() })) }),
      mcp: { annotations: { title: 'Search labs', ...READ_ONLY } },
      execute: async ({ query, limit }) => {
        counted('search_labs');
        const q = query.toLowerCase();
        return {
          matches: courseLabs()
            .filter((l) => l.title.toLowerCase().includes(q))
            .slice(0, limit)
            .map((l) => ({ number: l.number, title: l.title })),
        };
      },
    }) as ReturnType<typeof createTool>;
    tools.reset_progress = createTool({
      id: 'reset_progress',
      description: 'Resets a learner’s saved progress (destructive). In this fixture it changes nothing.',
      inputSchema: z.object({ learnerId: z.string().min(1).max(64).describe('Learner whose progress is erased') }),
      outputSchema: z.object({ reset: z.boolean(), note: z.string() }),
      mcp: {
        annotations: {
          title: 'Reset progress',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      execute: async () => {
        counted('reset_progress');
        return { reset: false, note: 'fixture: nothing was changed' };
      },
    }) as ReturnType<typeof createTool>;
  }
  const server = new MCPServer({
    id: FIXTURE.id,
    name: FIXTURE.name,
    version: FIXTURE.version,
    description: 'Local example MCP server for the Mastra Learning Platform labs',
    instructions: FIXTURE_INSTRUCTIONS,
    tools,
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
  /** Tool names the server advertises. */
  advertised: string[];
  /** Server-side executions per tool (proves that rejected calls never reached the server). */
  calls: Record<string, number>;
  openSockets(): number;
  listening(): boolean;
  close(): Promise<void>;
}

export async function startLocalFixture(options: { catalog?: FixtureCatalog } = {}): Promise<LocalFixture> {
  const calls: Record<string, number> = {};
  const mcp = createFixtureMcpServer({ catalog: options.catalog, onCall: (n) => (calls[n] = (calls[n] ?? 0) + 1) });
  const advertised =
    options.catalog === 'full' ? ['course_info', 'lab_title', 'search_labs', 'reset_progress'] : ['course_info', 'lab_title'];
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
    advertised,
    calls,
    openSockets: () => main.sockets.size + silent.sockets.size,
    listening: () => main.server.listening || silent.server.listening,
    async close() {
      await Promise.all([main.close(), silent.close()]);
      await mcp.close().catch(() => undefined);
    },
  };
}
