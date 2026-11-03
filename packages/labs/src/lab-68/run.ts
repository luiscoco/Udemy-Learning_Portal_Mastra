import { z } from 'zod';
import { summarizeChecks, type LabDefinition, type WorkflowGraph } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { toWorkflowGraph } from '../shared/workflow-graph.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { OFFLINE_PROVIDER } from '../services.js';
import { lab68Definition } from './definition.js';
import { CATALOG, findVisible, ROLES, TRACKING_ID, visibleFor, type Role } from './workflows.js';

export const Lab68InputSchema = z.object({
  role: z.enum(ROLES),
  workflowId: z.string().trim().min(1).max(60),
  orderValue: z.number().min(0).max(100_000),
  items: z.number().int().min(1).max(8),
  failStep: z.string().trim().max(60).default('none'),
  stepDelayMs: z.number().int().min(0).max(2_000),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab68Input = z.infer<typeof Lab68InputSchema>;

export type NodeStatus = 'success' | 'failed' | 'suspended' | 'skipped' | 'not-reached';

export interface Lab68Output {
  role: Role;
  /** The workflows this role may see. Hidden ones are never listed. */
  visible: { id: string; title: string }[];
  requested: string;
  found: boolean;
  graph: WorkflowGraph | null;
  /** Each node's final status, from Mastra's own step results. */
  statuses: Record<string, NodeStatus>;
  workflowStatus: string | null;
  /** Step ids in the order Mastra reported them: running first, then the result. */
  timeline: { stepId: string; status: string }[];
  /** The model step(s): which model really ran (node id, model, provider) and the text it streamed. */
  agentSteps: { nodeId: string; modelId?: string; provider?: string; text: string; tokens: number }[];
  simulated: boolean;
}

/** Offline email writer: two sentences that quote the tracking id from the prompt. */
export function emailScript() {
  return (v: PromptView): ScriptedTurn => {
    const id = v.lastUser.match(/TRK-d+/)?.[0] ?? TRACKING_ID;
    return { text: `Good news: your order has shipped and is on its way. You can follow it with tracking id ${id}.` };
  };
}

const http503 = () =>
  Object.assign(new Error('HTTP 503 (fault injection)'), { name: 'AI_APICallError', statusCode: 503, isRetryable: false });
/** Fails the model call before the provider is reached, so the fault costs nothing in live mode. */
function failingModel<M extends object>(inner: M): M {
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'doStream' || prop === 'doGenerate') return async () => Promise.reject(http503());
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Final status per node: what Mastra reported, else skipped (an untaken branch), else not reached. */
export function nodeStatuses(graph: WorkflowGraph, reported: Map<string, string>): Record<string, NodeStatus> {
  const out: Record<string, NodeStatus> = {};
  for (const n of graph.nodes) {
    const s = reported.get(n.id);
    if (s === 'success' || s === 'failed' || s === 'suspended') out[n.id] = s;
    else if (
      n.kind === 'branch' &&
      graph.nodes.some((o) => o.kind === 'branch' && o.layer === n.layer && o.id !== n.id && reported.has(o.id))
    )
      out[n.id] = 'skipped';
    else out[n.id] = 'not-reached';
  }
  return out;
}

export const lab68: LabImplementation<Lab68Input, Lab68Output, LabServices> = {
  definition: lab68Definition as LabDefinition,
  inputSchema: Lab68InputSchema,

  async run(ctx, input) {
    const visible = visibleFor(input.role);
    const entry = findVisible(input.workflowId, input.role);
    if (!entry) {
      // Hidden and nonexistent workflows get the same answer: nothing reveals that a hidden one exists.
      ctx.log('warn', `Unknown workflow "${input.workflowId}"`);
      return {
        role: input.role,
        visible,
        requested: input.workflowId,
        found: false,
        graph: null,
        statuses: {},
        workflowStatus: null,
        timeline: [],
        agentSteps: [],
        simulated: true,
      };
    }
    const settings = {
      orderValue: input.orderValue,
      items: input.items,
      failStep: input.failStep,
      stepDelayMs: input.stepDelayMs,
    };
    // Resolved only after the visibility check: a hidden workflow must answer exactly like an unknown one.
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: emailScript() });
    const model = input.failStep === 'emailWriter' ? failingModel(resolved.model as object) : resolved.model;
    const workflow = entry.build(settings, model);
    const graph = toWorkflowGraph(workflow, entry.title);
    ctx.emit({ type: 'workflow-graph', workflowId: entry.id, graph });

    const timeline: Lab68Output['timeline'] = [];
    const tracking = {
      ...ctx,
      emit: (e: Parameters<typeof ctx.emit>[0]) => {
        if (e.type === 'workflow-step' && e.stepId !== entry.id) timeline.push({ stepId: e.stepId, status: e.status });
        ctx.emit(e);
      },
    };
    const res = await streamWorkflow(tracking, entry.id, await workflow.createRun(), settings);
    const reported = new Map(res.steps.map((s) => [s.stepId, s.status]));
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated } });
    const nodeFor = (name: string) => graph.nodes.find((n) => n.id === name || n.id.endsWith(`.${name}`))?.id ?? name;
    return {
      role: input.role,
      visible,
      requested: input.workflowId,
      found: true,
      graph,
      statuses: nodeStatuses(graph, reported),
      workflowStatus: res.status,
      timeline,
      agentSteps: res.agentSteps.map((a) => ({
        nodeId: nodeFor(a.stepName),
        modelId: a.modelId,
        provider: a.provider,
        text: a.text,
        tokens: a.tokens,
      })),
      simulated: resolved.simulated,
    };
  },

  validate(out, input, { mode, events }) {
    const allowed = new Set(visibleFor(input.role).map((w) => w.id));
    const listedOk = out.visible.every((w) => allowed.has(w.id as never)) && out.visible.length === allowed.size;
    if (!out.found)
      return summarizeChecks([
        {
          id: 'hidden-indistinguishable',
          label: 'A workflow you may not see looks exactly like one that does not exist',
          passed:
            listedOk &&
            out.graph === null &&
            Object.keys(out.statuses).length === 0 &&
            out.workflowStatus === null &&
            out.timeline.length === 0,
          message: `"${out.requested}" not found; visible: ${out.visible.map((w) => w.id).join(', ') || 'none'}`,
        },
      ]);
    const g = out.graph!;
    const ids = g.nodes.map((n) => n.id);
    const executed = [...new Set(out.timeline.map((t) => t.stepId.replace(/\[\d+\]$/, '')))];
    const branches = g.nodes.filter((n) => n.kind === 'branch');
    const failed = input.failStep !== 'none' && ids.includes(input.failStep);
    const failIndex = g.nodes.find((n) => n.id === input.failStep)?.layer ?? Infinity;
    const runningBeforeEnd = executed.every((id) => {
      const first = out.timeline.findIndex((t) => t.stepId === id);
      return out.timeline[first]?.status === 'running';
    });
    return summarizeChecks([
      {
        id: 'graph-complete',
        label: 'Every step that ran has a node in the graph, and node ids are unique',
        passed: new Set(ids).size === ids.length && executed.every((id) => ids.includes(id)),
        message: `${g.nodes.length} nodes, ${g.edges.length} edges; ${executed.length} steps ran`,
      },
      {
        id: 'statuses-real',
        label: 'Every node shows the status Mastra reported for its step',
        passed: executed.every((id) => {
          const last = [...out.timeline].reverse().find((t) => t.stepId === id)?.status;
          return out.statuses[id] === (last === 'running' ? 'not-reached' : last);
        }),
        message: Object.entries(out.statuses)
          .map(([id, s]) => `${id}: ${s}`)
          .join(', '),
      },
      {
        id: 'branch-reflected',
        label: 'Exactly one branch ran; the other is shown as skipped',
        passed:
          branches.length === 0 ||
          (failed && failIndex < (branches[0]?.layer ?? 0)) ||
          (branches.filter((b) => out.statuses[b.id] === 'success' || out.statuses[b.id] === 'failed').length === 1 &&
            branches.filter((b) => out.statuses[b.id] === 'skipped').length === branches.length - 1),
        message: branches.map((b) => `${b.id}: ${out.statuses[b.id]}`).join(', ') || 'no branches',
      },
      {
        id: 'failure-reflected',
        label: 'A failing step shows as failed, and the steps after it as not reached',
        passed:
          !failed ||
          (out.statuses[input.failStep] === 'failed' &&
            g.nodes
              .filter((n) => n.layer > failIndex)
              .every((n) => out.statuses[n.id] === 'not-reached' || out.statuses[n.id] === 'skipped')),
        message: failed
          ? `${input.failStep}: ${out.statuses[input.failStep]}; workflow ${out.workflowStatus}`
          : 'no failure injected',
      },
      {
        id: 'live-order',
        label: 'Each step was shown running before its result',
        passed: runningBeforeEnd,
        message: `${out.timeline.length} live step events`,
      },
      agentCheck(out, mode, events),
      {
        id: 'hidden-indistinguishable',
        label: 'Only the workflows your role may see are listed',
        passed: listedOk && Object.keys(CATALOG).length > out.visible.length,
        message: `visible to ${input.role}: ${out.visible.map((w) => w.id).join(', ')}`,
      },
    ]);
  },
};

/** The model step: its node status matches Mastra; a draft that streamed equals the saved text; live means a real provider. */
function agentCheck(out: Lab68Output, mode: string, events: readonly { type: string; text?: string }[]) {
  const node = out.graph?.nodes.find((n) => n.id.endsWith('emailWriter'));
  const status = node ? out.statuses[node.id] : undefined;
  const trace = out.agentSteps.find((a) => a.nodeId === node?.id);
  const streamed = events
    .filter((e) => e.type === 'token')
    .map((e) => e.text ?? '')
    .join('');
  let passed: boolean;
  let message = 'no model step in this workflow';
  if (!node) passed = true;
  else if (status === 'success') {
    const real = mode !== 'live' || (Boolean(trace?.provider) && trace?.provider !== OFFLINE_PROVIDER);
    passed = Boolean(trace?.text) && streamed === trace!.text && trace!.text.includes(TRACKING_ID) && real;
    message = `${trace?.provider ?? '?'}/${trace?.modelId ?? '?'} streamed ${trace?.tokens ?? 0} tokens${trace?.text.includes(TRACKING_ID) ? ', tracking id included' : ', tracking id missing'}`;
  } else if (status === 'failed') {
    passed = !trace?.text;
    message = 'the model step failed before drafting anything';
  } else {
    passed = !trace?.text;
    message = `the model step was ${status}`;
  }
  return {
    id: 'agent-step-reflected',
    label: 'The model step shows its real status, and its streamed draft is what it produced',
    passed,
    message,
  };
}
