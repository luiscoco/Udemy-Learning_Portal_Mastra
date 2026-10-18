import { z } from 'zod';
import { noopLogger } from '@mastra/core/logger';
import { MCPClient } from '@mastra/mcp';
import { LABS } from '@mlp/lab-catalog';
import {
  McpCapabilitiesSchema,
  summarizeChecks,
  type LabDefinition,
  type McpCapabilities,
  type McpOperation,
} from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { sanitizeDetail, SERVER_KEY } from '../lab-46/connect.js';
import { FIXTURE_RESOURCES, startLocalFixture, type LocalFixture } from '../lab-46/fixture-server.js';
import { lab48Definition } from './definition.js';
import { capabilityRows, observeAdapter, probeProtocol } from './probe.js';

export const Lab48InputSchema = z.object({
  server: z.enum(['full', 'tools-only']),
  operation: z.enum(['read-resource', 'get-prompt']),
  resourceUri: z
    .string()
    .trim()
    .max(200)
    .regex(/^[a-z][a-z0-9+.-]*:\/\/[\w\-./]*$/, 'a URI such as course://syllabus')
    .default('course://syllabus'),
  promptName: z
    .string()
    .trim()
    .regex(/^[\w-]{1,64}$/)
    .default('explain-lab'),
  promptArgs: z
    .record(z.string().regex(/^[\w-]{1,40}$/), z.string().max(200))
    .refine((r) => Object.keys(r).length <= 5, 'at most 5 arguments')
    .default({ number: '47' }),
});
export type Lab48Input = z.infer<typeof Lab48InputSchema>;

export interface Lab48Output {
  mcpCapabilities: McpCapabilities;
  teardown: { protocolClientClosed: boolean; clientDisconnected: boolean; fixtureClosed: boolean; openSockets: number };
}

const LAB_TEMPLATE = /^course:\/\/labs\/(\d{1,2})$/;

/** Maps server errors on reads and prompt gets to stable codes. */
export function classifyOperationError(message: string): { code: string; message: string } {
  const m = sanitizeDetail(message);
  if (/Resource not found/i.test(m)) return { code: 'unknown-resource', message: m };
  if (/Prompt .* not found/i.test(m)) return { code: 'unknown-prompt', message: m };
  if (/Missing required argument/i.test(m)) return { code: 'missing-argument', message: m };
  if (/Method not found|-32601/i.test(m)) return { code: 'method-not-found', message: m };
  return { code: 'failed', message: m };
}

/** Client-side prompt templates used only when the server offers no prompts. */
export function localPrompt(name: string, args: Record<string, string>): string | { code: string; message: string } {
  if (name === 'explain-lab') {
    const n = args.number?.trim();
    if (!n) return { code: 'missing-argument', message: 'Missing required argument: number' };
    const title = LABS.find((l) => String(l.number) === n)?.title ?? 'an unknown lab';
    return `user: Explain lab ${n} (${title}) to a beginner: its goal, the key Mastra API and one common mistake.`;
  }
  if (name === 'study-plan')
    return `user: Propose a weekly study plan for the course with ${args.hoursPerWeek?.trim() || '4'} hours per week.`;
  return { code: 'unknown-prompt', message: `No local template named "${name}"` };
}

async function callTool(mcp: MCPClient, name: string, args: Record<string, unknown>): Promise<string> {
  const tools = await mcp.listTools();
  const r = await tools[`${SERVER_KEY}_${name}`]!.execute!(args as never, {} as never);
  return JSON.stringify(r, null, 2);
}

async function runOperation(mcp: MCPClient, input: Lab48Input, advertised: Record<string, unknown>): Promise<McpOperation> {
  if (input.operation === 'read-resource') {
    const uri = input.resourceUri;
    const base = { kind: 'read-resource' as const, target: uri };
    const lab = uri.match(LAB_TEMPLATE);
    const viaLabTitle = async (reason: string): Promise<McpOperation> => ({
      ...base,
      status: 'fallback',
      via: 'tool lab_title',
      content: await callTool(mcp, 'lab_title', { number: Number(lab![1]) }),
      fallbackReason: reason,
      error: null,
    });
    if (!('resources' in advertised)) {
      if (lab) return viaLabTitle('the server does not advertise resources; the lab number was taken from the URI');
      if (FIXTURE_RESOURCES.some((r) => r.uri === uri))
        return {
          ...base,
          status: 'fallback',
          via: 'tool course_info',
          content: await callTool(mcp, 'course_info', {}),
          fallbackReason: 'the server does not advertise resources; course_info gives an overview instead',
          error: null,
        };
      return {
        ...base,
        status: 'error',
        via: 'none',
        content: '',
        fallbackReason: null,
        error: { code: 'unknown-resource', message: 'The server offers no resources and there is no fallback for this URI.' },
      };
    }
    try {
      const r = await mcp.resources.read(SERVER_KEY, uri);
      const content = r.contents.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '[binary content]')).join('\n');
      return { ...base, status: 'server', via: 'resources.read', content, fallbackReason: null, error: null };
    } catch (e) {
      const err = classifyOperationError(e instanceof Error ? e.message : String(e));
      if (lab && err.code === 'unknown-resource')
        return viaLabTitle(`the server rejected the template URI (${err.message}); Mastra’s MCPServer only reads listed URIs`);
      return { ...base, status: 'error', via: 'resources.read', content: '', fallbackReason: null, error: err };
    }
  }

  const base = { kind: 'get-prompt' as const, target: input.promptName };
  if (!('prompts' in advertised)) {
    const local = localPrompt(input.promptName, input.promptArgs);
    return typeof local === 'string'
      ? {
          ...base,
          status: 'fallback',
          via: 'local template (not from the server)',
          content: local,
          fallbackReason: 'local fallback, not from the server: the server does not advertise prompts',
          error: null,
        }
      : { ...base, status: 'error', via: 'local template', content: '', fallbackReason: null, error: local };
  }
  try {
    const r = await mcp.prompts.get({ serverName: SERVER_KEY, name: input.promptName, args: input.promptArgs });
    const content = r.messages
      .map((m) => `${m.role}: ${m.content.type === 'text' ? m.content.text : `[${m.content.type}]`}`)
      .join('\n');
    return { ...base, status: 'server', via: 'prompts.get', content, fallbackReason: null, error: null };
  } catch (e) {
    return {
      ...base,
      status: 'error',
      via: 'prompts.get',
      content: '',
      fallbackReason: null,
      error: classifyOperationError(e instanceof Error ? e.message : String(e)),
    };
  }
}

export const lab48: LabImplementation<Lab48Input, Lab48Output, LabServices> = {
  definition: lab48Definition as LabDefinition,
  inputSchema: Lab48InputSchema,

  async run(ctx, input) {
    const full = input.server === 'full';
    const fixture = await startLocalFixture({ catalog: 'basic', resources: full, prompts: full });
    const mcp = new MCPClient({
      id: `lab48-${ctx.runId}`,
      timeout: 5_000,
      servers: { [SERVER_KEY]: { url: new URL(fixture.url), allowedHosts: [fixture.host], enableServerLogs: false } },
    });
    mcp.__setLogger(noopLogger);
    let clientDisconnected = false;
    try {
      let t0 = performance.now();
      const protocol = await probeProtocol(fixture.url, 5_000);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'protocol probe (MCP SDK)',
        status: 'success',
        output: { protocolVersion: protocol.protocolVersion, advertised: Object.keys(protocol.advertised) },
        durationMs: Math.round(performance.now() - t0),
      });
      ctx.log('info', `Server advertises: ${Object.keys(protocol.advertised).join(', ')}`);

      t0 = performance.now();
      const observed = await observeAdapter(mcp, protocol.advertised);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'adapter observations (Mastra MCPClient)',
        status: 'success',
        output: observed,
        durationMs: Math.round(performance.now() - t0),
      });

      t0 = performance.now();
      const operation = await runOperation(mcp, input, protocol.advertised);
      ctx.emit({
        type: 'workflow-step',
        stepId: `${operation.kind}: ${operation.target}`,
        status: operation.status === 'error' ? 'failed' : 'success',
        output: {
          status: operation.status,
          via: operation.via,
          fallbackReason: operation.fallbackReason,
          error: operation.error,
        },
        durationMs: Math.round(performance.now() - t0),
      });
      ctx.log(
        operation.status === 'server' ? 'info' : 'warn',
        operation.status === 'fallback'
          ? `Fallback via ${operation.via}: ${operation.fallbackReason}`
          : operation.status === 'error'
            ? `${operation.error?.code}: ${operation.error?.message}`
            : `Served by the server via ${operation.via}`,
      );

      const mcpCapabilities: McpCapabilities = {
        server: {
          name: protocol.serverInfo?.name ?? 'unknown',
          version: protocol.serverInfo?.version ?? 'unknown',
          protocolVersion: protocol.protocolVersion,
        },
        advertised: protocol.advertised,
        rows: capabilityRows(protocol, observed),
        operation,
      };
      await mcp.disconnect();
      clientDisconnected = true;
      await fixture.close();
      const teardown = {
        protocolClientClosed: protocol.closed,
        clientDisconnected,
        fixtureClosed: !fixture.listening(),
        openSockets: fixture.openSockets(),
      };
      ctx.emit({ type: 'workflow-step', stepId: 'teardown', status: 'success', output: teardown });
      return { mcpCapabilities, teardown };
    } finally {
      if (!clientDisconnected) await mcp.disconnect().catch(() => undefined);
      await closeQuietly(fixture);
    }
  },

  validate(out) {
    const c = out.mcpCapabilities;
    const parsed = McpCapabilitiesSchema.safeParse(c);
    const has = (k: string) => k in c.advertised;
    const row = (f: string) => c.rows.find((r) => r.feature === f);
    const consistent =
      row('Tools')?.server === (has('tools') ? 'advertised' : 'not-advertised') &&
      row('Resources')?.server === (has('resources') ? 'advertised' : 'not-advertised') &&
      row('Prompts')?.server === (has('prompts') ? 'advertised' : 'not-advertised');
    const probed = parsed.success && c.server.protocolVersion !== null && consistent;
    const layers =
      c.rows.some((r) => r.mastra === 'not-exposed') &&
      c.rows.some((r) => r.mastra === 'limited') &&
      c.rows.every((r) => r.protocol.length > 0 && r.observed.length > 0);
    const op = c.operation;
    const capability = op?.kind === 'read-resource' ? 'resources' : 'prompts';
    const handled =
      !!op &&
      (op.status === 'error' ? !!op.error && op.error.code !== 'failed' : op.content.length > 0) &&
      !(op.status === 'server' && !has(capability));
    const labelled = !!op && (op.status === 'fallback' ? !!op.fallbackReason && op.via.length > 0 : op.fallbackReason === null);
    const t = out.teardown;
    const released = t.protocolClientClosed && t.clientDisconnected && t.fixtureClosed && t.openSockets === 0;
    return summarizeChecks([
      {
        id: 'capabilities-probed',
        label: 'The advertised capabilities come from a protocol-level probe, and the matrix matches them',
        passed: probed,
        message: `protocol ${c.server.protocolVersion}; advertised: ${Object.keys(c.advertised).join(', ')}`,
      },
      {
        id: 'layers-distinguished',
        label:
          'The matrix separates protocol, server, Mastra adapter and observation, including limited and not-exposed features',
        passed: layers,
        message: `${c.rows.length} features: ${c.rows.filter((r) => r.mastra === 'limited').length} limited, ${c.rows.filter((r) => r.mastra === 'not-exposed').length} not exposed by Mastra`,
      },
      {
        id: 'operation-handled',
        label: 'The operation returns content or a classified error, and nothing is requested that the server does not advertise',
        passed: handled,
        message: op ? `${op.kind} ${op.target}: ${op.status}${op.error ? ` (${op.error.code})` : ''}` : 'no operation',
      },
      {
        id: 'fallback-labelled',
        label: 'Fallback content is labelled with where it came from and why',
        passed: labelled,
        message: op?.status === 'fallback' ? `via ${op.via}: ${op.fallbackReason}` : 'no fallback needed',
      },
      {
        id: 'resources-released',
        label: 'Both clients are closed and the fixture server is closed with no open sockets',
        passed: released,
        message: `protocol client closed: ${t.protocolClientClosed}, MCPClient disconnected: ${t.clientDisconnected}, fixture closed: ${t.fixtureClosed}, open sockets: ${t.openSockets}`,
      },
    ]);
  },
};

async function closeQuietly(f: LocalFixture) {
  await f.close().catch(() => undefined);
}
