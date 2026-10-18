import { z } from 'zod';
import { summarizeChecks, type LabDefinition, type McpCatalog } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { FACADE, LIMITS, planExposure, startFacade, type AuditEntry, type Refusal } from './facade.js';
import { discoverAndCall, EXTERNAL_CLIENT, tryWithoutToken } from './external.js';
import { createRegistry, type Risk } from './registry.js';
import { lab49Definition } from './definition.js';

const ToolId = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'lower-case letters, digits and _');

export const DEFAULT_EXPOSE = ['calculate_order_total', 'inventory_lookup', 'format_currency'];

export const Lab49InputSchema = z.object({
  expose: z.array(ToolId).max(10).default(DEFAULT_EXPOSE),
  toolName: ToolId,
  args: z.record(z.string(), z.unknown()).default({}),
});
export type Lab49Input = z.infer<typeof Lab49InputSchema>;

export interface Lab49Output {
  facade: {
    server: string;
    exposed: { id: string; source: string; risk: Risk }[];
    refused: Refusal[];
    unknownIds: string[];
    guards: string[];
  };
  external: {
    client: string;
    protocolVersion: string | null;
    unauthenticated: { rejected: boolean; httpStatus: number | null; code: string | null };
    discovered: string[];
  };
  mcpCatalog: McpCatalog;
  audit: AuditEntry[];
  /** How many times the L15 refund tool actually executed (must stay 0). */
  refundExecutions: number;
  teardown: { externalClientClosed: boolean; facadeClosed: boolean; openSockets: number };
}

export const lab49: LabImplementation<Lab49Input, Lab49Output, LabServices> = {
  definition: lab49Definition as LabDefinition,
  inputSchema: Lab49InputSchema,

  async run(ctx, input) {
    const { candidates, ledger } = createRegistry();
    const plan = planExposure(candidates, input.expose);
    ctx.emit({
      type: 'workflow-step',
      stepId: 'plan exposure',
      status: 'success',
      output: {
        exposed: plan.exposed.map((c) => c.id),
        refused: plan.refused.map((r) => `${r.id} (${r.reason})`),
        unknownIds: plan.unknownIds,
      },
    });
    for (const r of plan.refused) if (r.reason !== 'not-allowlisted') ctx.log('warn', `Refused ${r.id}: ${r.reason} (${r.why})`);
    if (plan.unknownIds.length) ctx.log('warn', `Unknown tool id(s) in the allowlist: ${plan.unknownIds.join(', ')}`);

    const facade = await startFacade(plan.exposed);
    try {
      ctx.emit({
        type: 'workflow-step',
        stepId: 'start façade',
        status: 'success',
        output: { tools: plan.exposed.length, auth: 'bearer token (per run, not shown)' },
      });

      const unauthenticated = await tryWithoutToken(facade.url);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'external client without token',
        status: unauthenticated.rejected ? 'success' : 'failed',
        output: unauthenticated,
      });

      ctx.emit({ type: 'tool-start', toolCallId: 'external-call', toolName: input.toolName, args: input.args });
      const session = await discoverAndCall(facade.url, facade.token, input.toolName, input.args);
      ctx.emit({
        type: 'tool-finish',
        toolCallId: 'external-call',
        toolName: input.toolName,
        status: session.call.status === 'success' ? 'success' : session.call.status === 'rejected' ? 'denied' : 'error',
        ...(session.call.status === 'success'
          ? { result: session.call.result }
          : { error: `${session.call.reason}: ${session.call.message}` }),
        durationMs: session.call.durationMs,
      });
      ctx.log('info', `External client discovered: ${session.tools.map((t) => t.name).join(', ') || 'nothing'}`);

      const mcpCatalog: McpCatalog = {
        server: {
          key: 'facade',
          name: session.serverInfo?.name ?? FACADE.name,
          version: session.serverInfo?.version ?? FACADE.version,
          protocolVersion: session.protocolVersion,
        },
        tools: session.tools,
        call: session.call,
      };
      await facade.close();
      const teardown = {
        externalClientClosed: session.closed,
        facadeClosed: !facade.listening(),
        openSockets: facade.openSockets(),
      };
      ctx.emit({ type: 'workflow-step', stepId: 'teardown', status: 'success', output: teardown });
      return {
        facade: {
          server: `${FACADE.name} ${FACADE.version}`,
          exposed: plan.exposed.map((c) => ({ id: c.id, source: c.source, risk: c.risk })),
          refused: plan.refused,
          unknownIds: plan.unknownIds,
          guards: [
            'loopback only (127.0.0.1)',
            'bearer token per run, compared in constant time',
            `request body ≤ ${LIMITS.maxBodyBytes} bytes`,
            'DNS-rebinding protection (Host must be 127.0.0.1)',
            `tool timeout ${LIMITS.timeoutMs} ms`,
            `result ≤ ${LIMITS.maxResultBytes} bytes`,
            'audit without argument values',
          ],
        },
        external: {
          client: EXTERNAL_CLIENT,
          protocolVersion: session.protocolVersion,
          unauthenticated,
          discovered: session.tools.map((t) => t.name),
        },
        mcpCatalog,
        audit: [...facade.audit],
        refundExecutions: ledger.executeCount,
        teardown,
      };
    } finally {
      await facade.close().catch(() => undefined);
    }
  },

  validate(out, input) {
    const exposed = out.facade.exposed.map((e) => e.id).sort();
    // Recompute the plan from the registry, independently of what the run reported.
    const candidates = createRegistry().candidates;
    const expectedExposed = candidates
      .filter((c) => c.risk === 'read-only' && input.expose.includes(c.id))
      .map((c) => c.id)
      .sort();
    const scoped =
      exposed.join() === expectedExposed.join() &&
      out.facade.refused.length === candidates.length - exposed.length &&
      out.facade.refused.every((r) => r.reason.length > 0 && !exposed.includes(r.id));
    const discovered = [...out.external.discovered].sort();
    const discoveryOk =
      discovered.join() === exposed.join() && out.mcpCatalog.tools.every((t) => t.inputSchema.type === 'object');
    const call = out.mcpCatalog.call!;
    const target = call.toolName;
    const auditFor = out.audit.filter((a) => a.tool === target);
    const callOk = exposed.includes(target)
      ? call.status === 'success'
        ? auditFor.length === 1 && auditFor[0]!.status === 'ok'
        : call.reason === 'invalid-arguments' && auditFor.length === 0
      : call.status === 'rejected' && call.reason === 'unknown-tool' && auditFor.length === 0;
    const sideEffectsOk = out.refundExecutions === 0;
    const auth = out.external.unauthenticated;
    const t = out.teardown;
    return summarizeChecks([
      {
        id: 'facade-scoped',
        label: 'Only allowlisted, read-only tools are published; every other candidate is refused with a reason',
        passed: scoped,
        message: `published: ${exposed.join(', ') || 'none'}; refused: ${out.facade.refused.map((r) => `${r.id} (${r.reason})`).join(', ')}`,
      },
      {
        id: 'auth-enforced',
        label: 'A client without the bearer token is rejected with HTTP 401',
        passed: auth.rejected && auth.httpStatus === 401,
        message: auth.rejected ? `rejected with HTTP ${auth.httpStatus} (${auth.code})` : 'an unauthenticated client connected',
      },
      {
        id: 'external-discovery',
        label: 'The external MCP client discovers exactly the published tools, with their schemas',
        passed: discoveryOk,
        message: `${out.external.client} discovered ${discovered.length} tool(s)`,
      },
      {
        id: 'allowlisted-call',
        label: 'A published tool is called and audited; anything else is refused by the server and never executes',
        passed: callOk && sideEffectsOk,
        message: `${target}: ${call.status}${call.reason ? ` (${call.reason})` : ''}; audit entries: ${auditFor.length}; refund executions: ${out.refundExecutions}`,
      },
      {
        id: 'resources-released',
        label: 'The external client and the façade are closed with no open sockets',
        passed: t.externalClientClosed && t.facadeClosed && t.openSockets === 0,
        message: `client closed: ${t.externalClientClosed}, façade closed: ${t.facadeClosed}, open sockets: ${t.openSockets}`,
      },
    ]);
  },
};
