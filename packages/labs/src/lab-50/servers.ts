import { noopLogger } from '@mastra/core/logger';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { LABS } from '@mlp/lab-catalog';
import { z } from 'zod';

export const SERVER_ORDER = ['calc', 'data'] as const;
export type ServerKey = (typeof SERVER_ORDER)[number];

/** Server-side execution counts per tool: the evidence for routing. */
export type Counter = Record<string, number>;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const Num = z.number().finite().min(-1e9).max(1e9);
const Result = z.object({ result: z.number() });
const Info = z.object({ server: z.string(), description: z.string() });
const count = (c: Counter, name: string) => (c[name] = (c[name] ?? 0) + 1);

function server(id: ServerKey, name: string, tools: Record<string, ReturnType<typeof createTool>>) {
  const s = new MCPServer({ id, name, version: '1.0.0', description: `${name} for lab 50`, tools });
  s.__setLogger(noopLogger);
  return s;
}

/** Calculator server: add, multiply, percent_of and info. */
export function createCalculatorServer(counter: Counter): MCPServer {
  const tools = {
    add: createTool({
      id: 'add',
      description: 'Adds two numbers.',
      inputSchema: z.object({ a: Num, b: Num }),
      outputSchema: Result,
      mcp: { annotations: { title: 'Add', ...READ_ONLY } },
      execute: async ({ a, b }) => (count(counter, 'add'), { result: a + b }),
    }),
    multiply: createTool({
      id: 'multiply',
      description: 'Multiplies two numbers.',
      inputSchema: z.object({ a: Num, b: Num }),
      outputSchema: Result,
      mcp: { annotations: { title: 'Multiply', ...READ_ONLY } },
      execute: async ({ a, b }) => (count(counter, 'multiply'), { result: a * b }),
    }),
    percent_of: createTool({
      id: 'percent_of',
      description: 'Returns percent % of value, for example 18 % of 240.',
      inputSchema: z.object({ percent: Num, value: Num }),
      outputSchema: Result,
      mcp: { annotations: { title: 'Percent of', ...READ_ONLY } },
      execute: async ({ percent, value }) => (count(counter, 'percent_of'), { result: Math.round(percent * value * 1e6) / 1e8 }),
    }),
    info: createTool({
      id: 'info',
      description: 'Describes this server.',
      inputSchema: z.object({}),
      outputSchema: Info,
      mcp: { annotations: { title: 'Server info', ...READ_ONLY } },
      execute: async () => (
        count(counter, 'info'),
        { server: 'Calculator server', description: 'Arithmetic: add, multiply, percent_of' }
      ),
    }),
  };
  return server('calc', 'Calculator server', tools as unknown as Record<string, ReturnType<typeof createTool>>);
}

/** Data server: lab_title, search_labs and info (over the course catalog). */
export function createDataServer(counter: Counter): MCPServer {
  const labs = () => LABS.filter((l) => l.number >= 1);
  const tools = {
    lab_title: createTool({
      id: 'lab_title',
      description: 'Returns the title of one lab by number (1 to 75).',
      inputSchema: z.object({ number: z.number().int().min(1).max(75) }),
      outputSchema: z.object({ number: z.number(), title: z.string() }),
      mcp: { annotations: { title: 'Lab title', ...READ_ONLY } },
      execute: async ({ number }) => (
        count(counter, 'lab_title'),
        { number, title: labs().find((l) => l.number === number)?.title ?? 'unknown' }
      ),
    }),
    search_labs: createTool({
      id: 'search_labs',
      description: 'Finds labs whose title contains the query.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(60), limit: z.number().int().min(1).max(10).default(3) }),
      outputSchema: z.object({ matches: z.array(z.object({ number: z.number(), title: z.string() })) }),
      mcp: { annotations: { title: 'Search labs', ...READ_ONLY } },
      execute: async ({ query, limit }) => {
        count(counter, 'search_labs');
        const q = query.toLowerCase();
        return {
          matches: labs()
            .filter((l) => l.title.toLowerCase().includes(q))
            .slice(0, limit)
            .map((l) => ({ number: l.number, title: l.title })),
        };
      },
    }),
    info: createTool({
      id: 'info',
      description: 'Describes this server.',
      inputSchema: z.object({}),
      outputSchema: Info,
      mcp: { annotations: { title: 'Server info', ...READ_ONLY } },
      execute: async () => (
        count(counter, 'info'),
        { server: 'Course data server', description: 'Course catalog: lab_title, search_labs' }
      ),
    }),
  };
  return server('data', 'Course data server', tools as unknown as Record<string, ReturnType<typeof createTool>>);
}
