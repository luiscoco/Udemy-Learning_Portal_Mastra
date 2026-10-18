import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { MCPClient } from '@mastra/mcp';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { classifyFailure, FAILURE_HELP, sanitizeDetail, type FailureCategory } from '../lab-46/connect.js';
import { closedLoopbackUrl, serveOnLoopback, type LoopbackServer } from '../lab-46/fixture-server.js';
import { lab50Definition } from './definition.js';
import { exposeTools, namespacedKeyCollisions, POLICIES, type Collision, type Route } from './policy.js';
import { createCalculatorServer, createDataServer, SERVER_ORDER, type Counter, type ServerKey } from './servers.js';

export const Lab50InputSchema = z.object({
  question: z.string().trim().min(3).max(500),
  collisionPolicy: z.enum(POLICIES),
  downServer: z.enum(['none', ...SERVER_ORDER]),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab50Input = z.infer<typeof Lab50InputSchema>;

export const INSTRUCTIONS =
  'You answer questions with tools from several MCP servers: calculator tools for arithmetic and course data tools for lab information. ' +
  'Always use a tool for arithmetic and lab titles; never compute or guess them yourself. ' +
  'If a tool you need is not available, say clearly which capability is unavailable instead of guessing. Answer in one or two short sentences.';

/** Which tool (by base name) each part of a question needs. Shared by the offline script and the checks. */
export interface Task {
  base: string;
  label: string;
  args: Record<string, unknown>;
  all?: boolean;
}
const NUM = '(-?\\d+(?:\\.\\d+)?)';
export function tasksFor(question: string): Task[] {
  const tasks: Task[] = [];
  const pct = question.match(new RegExp(`${NUM}\\s*%\\s*of\\s*${NUM}`, 'i'));
  if (pct)
    tasks.push({
      base: 'percent_of',
      label: `${pct[1]}% of ${pct[2]}`,
      args: { percent: Number(pct[1]), value: Number(pct[2]) },
    });
  const plus = question.match(new RegExp(`${NUM}\\s*plus\\s*${NUM}`, 'i'));
  if (plus) tasks.push({ base: 'add', label: `${plus[1]} plus ${plus[2]}`, args: { a: Number(plus[1]), b: Number(plus[2]) } });
  const times = question.match(new RegExp(`${NUM}\\s*(?:times|×)\\s*${NUM}`, 'i'));
  if (times)
    tasks.push({ base: 'multiply', label: `${times[1]} times ${times[2]}`, args: { a: Number(times[1]), b: Number(times[2]) } });
  const lab = question.match(/\blab\s+(\d{1,2})\b/i);
  if (lab) tasks.push({ base: 'lab_title', label: `the title of lab ${lab[1]}`, args: { number: Number(lab[1]) } });
  if (/\b(which|what) servers\b|\bdescribe (the |both )?servers\b|\binfo\b/i.test(question))
    tasks.push({ base: 'info', label: 'the server descriptions', args: {}, all: true });
  return tasks;
}
const matching = (names: readonly string[], base: string) => names.filter((n) => n === base || n.endsWith(`_${base}`));

function sentence(base: string, task: Task | undefined, out: Record<string, unknown>): string {
  if (out.error) return `The ${base} call failed.`;
  if (base === 'lab_title') return `Lab ${String(out.number)} is “${String(out.title)}”.`;
  if (base === 'info') return `${String(out.server)}: ${String(out.description)}.`;
  return `${task?.label ?? base} is ${String(out.result)}.`;
}

/**
 * What the model receives for an MCP tool result: the structured object, JSON text, or MCP content parts
 * ([{ type: 'text', text }]). Normalised to an object for the offline script.
 */
export function modelOutput(o: unknown): Record<string, unknown> {
  const parse = (t: string) => {
    try {
      const v: unknown = JSON.parse(t);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : { text: t };
    } catch {
      return { text: t };
    }
  };
  if (typeof o === 'string') return parse(o);
  if (Array.isArray(o)) {
    const text = o.find((p): p is { type: string; text: string } => !!p && p.type === 'text' && typeof p.text === 'string');
    return text ? parse(text.text) : {};
  }
  if (o && typeof o === 'object') {
    const c = (o as { content?: unknown }).content;
    if (Array.isArray(c) && !('result' in o) && !('title' in o) && !('server' in o)) return modelOutput(c);
    return o as Record<string, unknown>;
  }
  return {};
}

/** Offline model: calls the tools the question needs among the offered names, then reports results and gaps. */
export function offlineScript(question: string) {
  const tasks = tasksFor(question);
  return (view: PromptView): ScriptedTurn => {
    const missing = tasks.filter((t) => matching(view.toolNames, t.base).length === 0);
    const gaps = missing.map(
      (t) =>
        `${t.label[0]!.toUpperCase()}${t.label.slice(1)} is unavailable: no ${t.base} tool is offered (its server may be offline, or the name was excluded).`,
    );
    if (view.toolResults.length === 0) {
      const toolCalls = tasks.flatMap((t) => {
        const names = matching(view.toolNames, t.base);
        return (t.all ? names : names.slice(0, 1)).map((toolName) => ({ toolName, input: t.args }));
      });
      if (toolCalls.length) return { text: '', toolCalls };
      return { text: gaps.join(' ') || 'I could not find a tool for this question.' };
    }
    const lines = view.toolResults.map((r) => {
      const base = tasks.find((t) => r.toolName === t.base || r.toolName.endsWith(`_${t.base}`))?.base ?? r.toolName;
      return sentence(
        base,
        tasks.find((t) => t.base === base),
        modelOutput(r.output),
      );
    });
    return { text: [...lines, ...gaps].join(' ') };
  };
}

export interface ServerReport {
  key: ServerKey;
  name: string;
  status: 'connected' | 'failed';
  tools: string[];
  error: { category: FailureCategory; message: string; hint: string; detail: string } | null;
}
export type RoutedCall = ToolTrace & Route;

export interface Lab50Output {
  policy: Lab50Input['collisionPolicy'];
  servers: ServerReport[];
  collisions: Collision[];
  keyCollisions: Collision[];
  exposed: ({ name: string } & Route)[];
  toolCalls: RoutedCall[];
  serverExecutions: Record<ServerKey, Counter>;
  answer: string;
  teardown: { clientDisconnected: boolean; serversClosed: boolean; openSockets: number };
}

const NAMES: Record<ServerKey, string> = { calc: 'Calculator server', data: 'Course data server' };
const OWNED: Record<ServerKey, string[]> = {
  calc: ['add', 'multiply', 'percent_of', 'info'],
  data: ['lab_title', 'search_labs', 'info'],
};
export const UNAVAILABLE = /unavailable|offline|not available|cannot|can't|can’t|could not|couldn't|unable|no .* tool/i;

export const lab50: LabImplementation<Lab50Input, Lab50Output, LabServices> = {
  definition: lab50Definition as LabDefinition,
  inputSchema: Lab50InputSchema,

  async run(ctx, input) {
    const executions: Record<ServerKey, Counter> = { calc: {}, data: {} };
    const running: Partial<Record<ServerKey, LoopbackServer>> = {};
    const urls = {} as Record<ServerKey, string>;
    for (const key of SERVER_ORDER) {
      if (key === input.downServer) urls[key] = await closedLoopbackUrl();
      else {
        const mcp = key === 'calc' ? createCalculatorServer(executions.calc) : createDataServer(executions.data);
        running[key] = await serveOnLoopback(mcp);
        urls[key] = running[key]!.url;
      }
    }
    ctx.emit({
      type: 'workflow-step',
      stepId: 'start servers',
      status: 'success',
      output: { running: Object.keys(running), down: input.downServer === 'none' ? [] : [input.downServer] },
    });

    const client = new MCPClient({
      id: `lab50-${ctx.runId}`,
      timeout: 5_000,
      servers: Object.fromEntries(
        SERVER_ORDER.map((k) => [k, { url: new URL(urls[k]), allowedHosts: [new URL(urls[k]).host], enableServerLogs: false }]),
      ),
    });
    client.__setLogger(noopLogger);
    let clientDisconnected = false;
    try {
      let t0 = performance.now();
      const discovered = await client.listToolsetsWithErrors({ perServerTimeoutMs: 1_500 });
      const servers: ServerReport[] = SERVER_ORDER.map((key) => {
        const err = discovered.errorDetails[key] ?? (discovered.errors[key] ? { message: discovered.errors[key]! } : undefined);
        if (err) {
          const category = classifyFailure(err);
          return {
            key,
            name: NAMES[key],
            status: 'failed',
            tools: [],
            error: { category, ...FAILURE_HELP[category], detail: sanitizeDetail(err.message) },
          };
        }
        return {
          key,
          name: NAMES[key],
          status: 'connected',
          tools: Object.keys(discovered.toolsets[key] ?? {}).sort(),
          error: null,
        };
      });
      for (const s of servers)
        ctx.log(
          s.status === 'connected' ? 'info' : 'warn',
          s.status === 'connected'
            ? `${s.key}: ${s.tools.join(', ')}`
            : `${s.key} is ${s.error!.category}: continuing without it`,
        );
      const toolsets = Object.fromEntries(
        SERVER_ORDER.filter((k) => discovered.toolsets[k]).map((k) => [k, discovered.toolsets[k]!]),
      );
      const { tools, routing, collisions } = exposeTools(toolsets, SERVER_ORDER, input.collisionPolicy);
      const keyCollisions = namespacedKeyCollisions(toolsets);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'discover and apply policy',
        status: 'success',
        output: {
          policy: input.collisionPolicy,
          exposed: Object.keys(tools),
          collisions: collisions.map((c) => `${c.name}: ${c.resolution}`),
        },
        durationMs: Math.round(performance.now() - t0),
      });

      const resolved = ctx.services.models.resolve({
        mode: ctx.mode,
        modelId: input.modelId,
        offline: offlineScript(input.question),
      });
      const agent = withLabLogger(
        ctx,
        new Agent({
          id: 'multi-server-agent',
          name: 'Multi-server agent',
          instructions: INSTRUCTIONS,
          model: resolved.model,
          tools,
        }),
      );
      t0 = performance.now();
      ctx.emit({ type: 'workflow-step', stepId: 'agent', status: 'running' });
      const res = await streamAgent(ctx, agent, input.question, { maxSteps: 4 });
      ctx.emit({
        type: 'workflow-step',
        stepId: 'agent',
        status: 'success',
        output: { toolCalls: res.tools.length },
        durationMs: Math.round(performance.now() - t0),
      });
      const toolCalls: RoutedCall[] = res.tools.map((t) => ({
        ...t,
        ...(routing[t.toolName] ?? { server: 'unknown', tool: t.toolName }),
      }));
      for (const t of toolCalls) ctx.log('info', `${t.toolName} → ${t.server}.${t.tool}: ${t.status}`);
      ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, maxSteps: 4 } });

      await client.disconnect();
      clientDisconnected = true;
      await Promise.all(Object.values(running).map((s) => s!.close()));
      const teardown = {
        clientDisconnected,
        serversClosed: Object.values(running).every((s) => !s!.listening()),
        openSockets: Object.values(running).reduce((n, s) => n + s!.openSockets(), 0),
      };
      ctx.emit({ type: 'workflow-step', stepId: 'teardown', status: 'success', output: teardown });
      return {
        policy: input.collisionPolicy,
        servers,
        collisions,
        keyCollisions,
        exposed: Object.entries(routing).map(([name, r]) => ({ name, ...r })),
        toolCalls,
        serverExecutions: { calc: { ...executions.calc }, data: { ...executions.data } },
        answer: res.text,
        teardown,
      };
    } finally {
      if (!clientDisconnected) await client.disconnect().catch(() => undefined);
      await Promise.all(Object.values(running).map((s) => s!.close().catch(() => undefined)));
    }
  },

  validate(out, input) {
    const down = input.downServer;
    const serversOk = out.servers.every((s) =>
      s.key === down
        ? s.status === 'failed' && !!s.error && s.error.category !== 'unknown'
        : s.status === 'connected' && s.tools.length > 0,
    );

    const names = out.exposed.map((e) => e.name);
    const connected = out.servers.filter((s) => s.status === 'connected');
    const shared = [...new Set(connected.flatMap((s) => s.tools))].filter(
      (t) => connected.filter((s) => s.tools.includes(t)).length > 1,
    );
    const policyOk = shared.every((t) => {
      const owners = connected.filter((s) => s.tools.includes(t)).map((s) => s.key);
      if (out.policy === 'namespace') return owners.every((o) => names.includes(`${o}_${t}`)) && !names.includes(t);
      if (out.policy === 'first-wins')
        return (
          out.exposed.filter((e) => e.name === t).length === 1 && out.exposed.find((e) => e.name === t)!.server === owners[0]
        );
      return !names.includes(t);
    });
    const collisionsOk =
      new Set(names).size === names.length &&
      policyOk &&
      out.collisions.length === shared.length &&
      out.keyCollisions.length === 0;

    const ok = out.toolCalls.filter((t) => t.status === 'success');
    const expected: Record<string, number> = {};
    for (const t of ok) expected[`${t.server}.${t.tool}`] = (expected[`${t.server}.${t.tool}`] ?? 0) + 1;
    const actual: Record<string, number> = {};
    for (const [s, c] of Object.entries(out.serverExecutions))
      for (const [tool, n] of Object.entries(c)) actual[`${s}.${tool}`] = n;
    const routedOk =
      out.toolCalls.every((t) => t.server !== 'unknown' && t.server !== down) &&
      JSON.stringify(Object.entries(expected).sort()) === JSON.stringify(Object.entries(actual).sort());

    const tasks = tasksFor(input.question);
    const healthy = SERVER_ORDER.filter((k) => k !== down);
    // A task needs the down server when no healthy server offers its tool.
    const needsDown =
      down !== 'none' && tasks.some((t) => OWNED[down].includes(t.base) && !healthy.some((h) => OWNED[h].includes(t.base)));
    const needsHealthy = tasks.some((t) => healthy.some((h) => OWNED[h].includes(t.base)));
    const isolatedOk =
      down === 'none'
        ? out.servers.every((s) => s.status === 'connected')
        : (!needsHealthy || ok.length > 0) && (!needsDown || UNAVAILABLE.test(out.answer));

    const values = ok.map((t) => {
      const r = (t.result ?? {}) as Record<string, unknown>;
      return t.tool === 'lab_title'
        ? String(r.title)
        : t.tool === 'info'
          ? String(r.server)
          : t.tool === 'search_labs'
            ? ''
            : String(r.result);
    });
    const missingValues = values.filter((v) => v && !out.answer.includes(v));
    const t = out.teardown;
    return summarizeChecks([
      {
        id: 'servers-connected',
        label: 'Each server is connected, except a server that is down, which is reported with a known category',
        passed: serversOk,
        message: out.servers.map((s) => `${s.key}: ${s.status}${s.error ? ` (${s.error.category})` : ''}`).join('; '),
      },
      {
        id: 'collisions-resolved',
        label: 'Exposed tool names are unique, and every shared name is resolved as the policy says',
        passed: collisionsOk,
        message: `${out.policy}: ${out.collisions.map((c) => `${c.name}: ${c.resolution}`).join('; ') || 'no shared names'}`,
      },
      {
        id: 'calls-routed',
        label: 'Every successful call ran on the server that owns the tool (server-side counters match)',
        passed: routedOk,
        message: ok.map((c) => `${c.toolName} → ${c.server}`).join(', ') || 'no successful calls',
      },
      {
        id: 'partial-failure-isolated',
        label: 'A server that is down does not stop the agent: healthy tools still run and the gap is reported',
        passed: isolatedOk,
        message:
          down === 'none'
            ? 'all servers up'
            : `${down} down; ${ok.length} successful call(s); gap reported: ${UNAVAILABLE.test(out.answer)}`,
      },
      {
        id: 'answer-grounded',
        label: 'The answer contains each tool result it relies on',
        passed: missingValues.length === 0 && out.answer.trim().length > 0,
        message: missingValues.length
          ? `missing in the answer: ${missingValues.join(', ')}`
          : 'all tool results appear in the answer',
      },
      {
        id: 'resources-released',
        label: 'The client is disconnected and both servers are closed with no open sockets',
        passed: t.clientDisconnected && t.serversClosed && t.openSockets === 0,
        message: `client disconnected: ${t.clientDisconnected}, servers closed: ${t.serversClosed}, open sockets: ${t.openSockets}`,
      },
    ]);
  },
};
