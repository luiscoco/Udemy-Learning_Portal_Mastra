import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { z } from 'zod';
import { noopLogger } from '@mastra/core/logger';
import { MCPClient } from '@mastra/mcp';
import {
  McpCatalogSchema,
  mcpParameters,
  summarizeChecks,
  type LabDefinition,
  type McpCall,
  type McpCatalog,
  type McpTool,
} from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { sanitizeDetail, SERVER_KEY } from '../lab-46/connect.js';
import { startLocalFixture, type LocalFixture } from '../lab-46/fixture-server.js';
import { lab47Definition } from './definition.js';
import { decide, fieldErrorsOf, resolveName, suggest } from './policy.js';

const ToolName = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/, 'letters, digits, _ . and - only');

export const DEFAULT_ALLOWLIST = ['course_info', 'lab_title', 'search_labs'];

export const Lab47InputSchema = z.object({
  toolName: ToolName,
  args: z.record(z.string(), z.unknown()).default({}),
  allowlist: z.array(ToolName).max(10).default(DEFAULT_ALLOWLIST),
});
export type Lab47Input = z.infer<typeof Lab47InputSchema>;

export interface Lab47Output {
  mcpCatalog: McpCatalog;
  advertised: string[];
  serverCalls: Record<string, number>;
  teardown: { clientDisconnected: boolean; fixtureClosed: boolean; openSockets: number };
}

const totalCalls = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

const baseLab47: LabImplementation<Lab47Input, Lab47Output, LabServices> = {
  definition: lab47Definition as LabDefinition,
  inputSchema: Lab47InputSchema,

  async run(ctx, input) {
    const fixture = await startLocalFixture({ catalog: 'full' });
    const client = new MCPClient({
      id: `lab47-${ctx.runId}`,
      timeout: 5_000,
      servers: { [SERVER_KEY]: { url: new URL(fixture.url), allowedHosts: [fixture.host], enableServerLogs: false } },
    });
    client.__setLogger(noopLogger);
    let clientDisconnected = false;
    try {
      const t0 = performance.now();
      const discovered = await client.listToolDefinitionsWithErrors({ perServerTimeoutMs: 5_000 });
      const err = discovered.errorDetails[SERVER_KEY];
      if (err) throw new Error(`Discovery failed: ${sanitizeDetail(err.message)}`);
      const defs = discovered.definitions[SERVER_KEY] ?? {};
      const names = Object.keys(defs).sort();
      ctx.emit({
        type: 'workflow-step',
        stepId: 'discover',
        status: 'success',
        output: { tools: names },
        durationMs: Math.round(performance.now() - t0),
      });
      ctx.log('info', `Discovered ${names.length} tool(s): ${names.join(', ')}`);

      const tools: McpTool[] = names.map((name) => {
        const d = defs[name]!;
        const annotations = d.annotations ?? null;
        const decision = decide(name, [{ name, annotations }], input.allowlist);
        return {
          key: `${SERVER_KEY}_${name}`,
          name,
          title: d.title ?? annotations?.title ?? null,
          description: d.description ?? '',
          annotations,
          inputSchema: (d.inputSchema ?? {}) as Record<string, unknown>,
          outputSchema: (d.outputSchema ?? null) as Record<string, unknown> | null,
          permission: { allowed: decision.allowed, reason: decision.message },
        };
      });

      const name = resolveName(input.toolName, SERVER_KEY, names);
      const decision = decide(name, tools, input.allowlist);
      const callId = `call-${name}`;
      ctx.emit({ type: 'tool-start', toolCallId: callId, toolName: name, args: input.args });
      const started = performance.now();
      let call: McpCall;
      if (!decision.allowed) {
        call = {
          toolName: name,
          args: input.args,
          status: 'rejected',
          reason: decision.reason,
          message: decision.message,
          suggestions: decision.reason === 'unknown-tool' ? suggest(name, names) : [],
          fieldErrors: [],
          result: null,
          durationMs: 0,
        };
      } else {
        const tool = await client.toolFromDefinition({ serverName: SERVER_KEY, definition: defs[name]! });
        try {
          const r = (await tool.execute!(input.args as never, {} as never)) as unknown;
          const validation = r && typeof r === 'object' && (r as { error?: unknown }).error === true;
          call = validation
            ? {
                toolName: name,
                args: input.args,
                status: 'rejected',
                reason: 'invalid-arguments',
                message: sanitizeDetail(String((r as { message?: unknown }).message ?? 'Invalid arguments')),
                suggestions: [],
                fieldErrors: fieldErrorsOf((r as { validationErrors?: unknown }).validationErrors),
                result: null,
                durationMs: Math.round(performance.now() - started),
              }
            : {
                toolName: name,
                args: input.args,
                status: 'success',
                reason: null,
                message: decision.message,
                suggestions: [],
                fieldErrors: [],
                result: r,
                durationMs: Math.round(performance.now() - started),
              };
        } catch (e) {
          call = {
            toolName: name,
            args: input.args,
            status: 'error',
            reason: 'tool-error',
            message: sanitizeDetail(e instanceof Error ? e.message : String(e)),
            suggestions: [],
            fieldErrors: [],
            result: null,
            durationMs: Math.round(performance.now() - started),
          };
        }
      }
      ctx.emit({
        type: 'tool-finish',
        toolCallId: callId,
        toolName: name,
        status: call.status === 'success' ? 'success' : call.status === 'rejected' ? 'denied' : 'error',
        ...(call.status === 'success' ? { result: call.result } : { error: `${call.reason}: ${call.message}` }),
        durationMs: call.durationMs,
      });
      ctx.log(call.status === 'success' ? 'info' : 'warn', `${name}: ${call.status}${call.reason ? ` (${call.reason})` : ''}`);

      const info = client.getServerInfo()[SERVER_KEY];
      const mcpCatalog: McpCatalog = {
        server: {
          key: SERVER_KEY,
          name: info?.name ?? 'unknown',
          version: info?.version ?? 'unknown',
          protocolVersion: client.getServerProtocolVersions()[SERVER_KEY] ?? null,
        },
        tools,
        call,
      };
      await client.disconnect();
      clientDisconnected = true;
      return {
        mcpCatalog,
        advertised: fixture.advertised,
        serverCalls: { ...fixture.calls },
        teardown: await teardown(fixture),
      };
    } finally {
      if (!clientDisconnected) await client.disconnect().catch(() => undefined);
      await fixture.close();
    }

    async function teardown(f: LocalFixture) {
      await f.close();
      const t = { clientDisconnected, fixtureClosed: !f.listening(), openSockets: f.openSockets() };
      ctx.emit({ type: 'workflow-step', stepId: 'teardown', status: 'success', output: t });
      return t;
    }
  },

  validate(out, input) {
    const parsed = McpCatalogSchema.safeParse(out.mcpCatalog);
    const cat = out.mcpCatalog;
    const names = cat.tools.map((t) => t.name);
    const discoveredOk =
      [...names].sort().join() === [...out.advertised].sort().join() && cat.tools.every((t) => t.inputSchema.type === 'object');
    const schemaOk = parsed.success && cat.tools.every((t) => Array.isArray(mcpParameters(t.inputSchema)));
    const call = cat.call;
    const expected = call ? decide(resolveName(input.toolName, cat.server.key, names), cat.tools, input.allowlist) : null;
    const calls = totalCalls(out.serverCalls);
    const policyOk =
      !!call &&
      !!expected &&
      (expected.allowed
        ? call.reason !== 'unknown-tool' && call.reason !== 'not-allowlisted' && call.reason !== 'not-read-only'
        : call.status === 'rejected' && call.reason === expected.reason) &&
      (call.status === 'success' ? calls === 1 : calls === 0);
    const reportedOk =
      !!call &&
      (call.status === 'success'
        ? call.result !== null && call.result !== undefined
        : call.reason !== null && call.message.length > 0);
    const released = out.teardown.clientDisconnected && out.teardown.fixtureClosed && out.teardown.openSockets === 0;
    return summarizeChecks([
      {
        id: 'catalog-discovered',
        label: 'The tool list comes from the server at runtime, and every tool has an object input schema',
        passed: discoveredOk,
        message: `${names.length} tool(s) discovered of ${out.advertised.length} advertised`,
      },
      {
        id: 'schema-shown',
        label: 'Every tool shows its title, description, annotations and parameter table in the UI',
        passed: schemaOk,
        message: parsed.success ? 'catalog matches the UI contract' : (parsed.error.issues[0]?.message ?? 'invalid catalog'),
      },
      {
        id: 'policy-enforced',
        label: 'Only discovered, allowlisted, read-only tools are called; rejected calls never reach the server',
        passed: policyOk,
        message: `${call?.toolName}: ${call?.status}${call?.reason ? ` (${call.reason})` : ''}; server executions: ${calls}`,
      },
      {
        id: 'call-reported',
        label: 'The call shows its arguments and either the result or the reason it was rejected',
        passed: reportedOk,
        message: call ? (call.status === 'success' ? 'result shown' : `${call.reason}: ${call.message}`) : 'no call',
      },
      {
        id: 'resources-released',
        label: 'The client is disconnected and the fixture server is closed with no open sockets',
        passed: released,
        message: `client disconnected: ${out.teardown.clientDisconnected}, fixture closed: ${out.teardown.fixtureClosed}, open sockets: ${out.teardown.openSockets}`,
      },
    ]);
  },
};

export const lab47 = withLiveCheckpoint(baseLab47);
