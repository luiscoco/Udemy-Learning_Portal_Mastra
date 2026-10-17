import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow } from '../shared/workflow-stream.js';
import { lab28Definition } from './definition.js';
import { buildTriageWorkflow, mergeTriage, TriageSchema, type Classification, type Triage } from './triage.js';

export const Lab28InputSchema = z.object({
  ticketId: z.string().regex(/^T-\d{3,6}$/),
  text: z.string().trim().min(5).max(2_000),
  classifyLatencyMs: z.number().int().min(0).max(3_000),
  summarizeLatencyMs: z.number().int().min(0).max(3_000),
  failingBranch: z.enum(['none', 'summarize']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab28Input = z.infer<typeof Lab28InputSchema>;

export interface BranchTiming {
  stepId: string;
  status: string;
  /** Milliseconds from the first branch start, from Mastra's recorded startedAt/endedAt. */
  startMs: number;
  endMs: number;
  durationMs: number;
  output: unknown;
}

export interface Lab28Output {
  status: string;
  /** "simulated latency (scripted delay)" offline; "real provider latency" live. */
  latencySource: string;
  branches: BranchTiming[];
  /** Order in which branch results arrived on the stream. */
  completionOrder: string[];
  timing: { parallelSpanMs: number; sumOfBranchesMs: number; overlapMs: number; measuredSpeedup: number } | null;
  mergeRan: boolean;
  merged: Triage | null;
  error: string | null;
}

/** Offline classification by keywords. */
export function classifyOffline(text: string): Classification {
  const t = text.toLowerCase();
  const category = /charge|refund|invoice|payment|billed/.test(t)
    ? 'billing'
    : /crash|error|bug|broken|not working/.test(t)
      ? 'technical'
      : /password|login|account|hacked/.test(t)
        ? 'account'
        : /deliver|package|shipping|tracking/.test(t)
          ? 'shipping'
          : 'other';
  const priority = /asap|urgent|immediately|second time|again/.test(t) ? 'high' : /soon|please/.test(t) ? 'medium' : 'low';
  return { category, priority };
}

/** Offline summary: the first sentence, trimmed. */
export function summarizeOffline(text: string): string {
  const first = text
    .replace(/^\s*(hi|hello|dear [^,]+)[,!.]?\s*/i, '')
    .split(/(?<=[.!?])\s/)[0]!
    .trim();
  return `Customer reports: ${first.length > 140 ? `${first.slice(0, 139)}…` : first}`;
}

export const lab28: LabImplementation<Lab28Input, Lab28Output, LabServices> = {
  definition: lab28Definition as LabDefinition,
  inputSchema: Lab28InputSchema,

  async run(ctx, input) {
    const offline = ctx.mode === 'offline';
    // One model per branch (no shared state); offline delays are scripted and labelled as such.
    const classifierModel = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: (v: PromptView): ScriptedTurn => ({
        text: JSON.stringify(classifyOffline(v.lastUser)),
        delayMs: input.classifyLatencyMs,
      }),
    });
    const summarizerModel = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: (v: PromptView): ScriptedTurn => ({ text: summarizeOffline(v.lastUser), delayMs: input.summarizeLatencyMs }),
    });
    const classifier = withLabLogger(
      ctx,
      new Agent({
        id: 'ticket-classifier',
        name: 'Ticket Classifier',
        instructions:
          'Classify the support ticket: category (billing, technical, account, shipping, other) and priority (low, medium, high).',
        model: classifierModel.model,
      }),
    );
    const summarizer = withLabLogger(
      ctx,
      new Agent({
        id: 'ticket-summarizer',
        name: 'Ticket Summarizer',
        instructions:
          'Summarise the support ticket in one short sentence starting with "Customer reports:". No greeting, no advice.',
        model: summarizerModel.model,
      }),
    );
    const workflow = buildTriageWorkflow(
      { classifier, summarizer },
      { failSummarize: input.failingBranch === 'summarize', signal: ctx.signal },
    );

    const completionOrder: string[] = [];
    const recordOrder = (e: { type: string; stepId?: string; status?: string }) => {
      if (e.type === 'workflow-step' && (e.stepId === 'classify' || e.stepId === 'summarize') && e.status !== 'running')
        completionOrder.push(e.stepId);
    };
    const emit = ctx.emit.bind(ctx);
    const watchedCtx = { ...ctx, emit: (e: Parameters<typeof emit>[0]) => (recordOrder(e as never), emit(e)) };
    const res = await runTypedWorkflow(
      watchedCtx,
      'triage-workflow',
      await workflow.createRun(),
      { ticketId: input.ticketId, text: input.text },
      TriageSchema,
    );

    // Timing from Mastra's own step records (epoch ms): measured, never estimated.
    const recs = res.stepRecords;
    const branchIds = ['classify', 'summarize'].filter((id) => recs[id]?.startedAt !== undefined);
    const t0 = Math.min(...branchIds.map((id) => recs[id]!.startedAt!));
    const branches: BranchTiming[] = branchIds.map((id) => {
      const r = recs[id]!;
      const start = r.startedAt! - t0;
      const end = (r.endedAt ?? r.startedAt!) - t0;
      return { stepId: id, status: String(r.status), startMs: start, endMs: end, durationMs: end - start, output: r.output };
    });
    let timing: Lab28Output['timing'] = null;
    if (branches.length === 2) {
      const [a, b] = branches as [BranchTiming, BranchTiming];
      const span = Math.max(a.endMs, b.endMs) - Math.min(a.startMs, b.startMs);
      const sum = a.durationMs + b.durationMs;
      timing = {
        parallelSpanMs: span,
        sumOfBranchesMs: sum,
        overlapMs: Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)),
        measuredSpeedup: span > 0 ? Number((sum / span).toFixed(2)) : 1,
      };
      ctx.log('info', `measured: branches span ${span} ms vs ${sum} ms if run one after the other (×${timing.measuredSpeedup})`);
    }
    const latencySource = offline ? 'simulated latency (scripted delay in offline mode)' : 'real provider latency';
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: classifierModel.simulated, latencySource },
      annotations: timing ? { parallelSpanMs: timing.parallelSpanMs, sumOfBranchesMs: timing.sumOfBranchesMs } : {},
    });
    return {
      status: res.status,
      latencySource,
      branches,
      completionOrder,
      timing,
      mergeRan: recs.merge?.status === 'success',
      merged: res.typed,
      error: res.error ?? null,
    };
  },

  validate(out, input) {
    const ok = out.branches.filter((b) => b.status === 'success');
    const recomputed =
      ok.length === 2
        ? mergeTriage(input.ticketId, {
            classify: out.branches.find((b) => b.stepId === 'classify')!.output as Classification,
            summarize: out.branches.find((b) => b.stepId === 'summarize')!.output as { summary: string },
          })
        : null;
    return summarizeChecks([
      {
        id: 'both-completed',
        label: 'Both branches completed',
        passed: ok.length === 2,
        message: out.branches.map((b) => `${b.stepId}: ${b.status}`).join(', ') || 'no branch ran',
      },
      {
        id: 'joined',
        label: 'The merge step ran once with both branch outputs',
        passed: out.mergeRan && out.merged !== null,
        message: out.error ?? 'merged',
      },
      {
        id: 'ran-in-parallel',
        label: 'The branches overlapped in time (measured from Mastra’s step timestamps)',
        passed: (out.timing?.overlapMs ?? 0) > 0,
        message: out.branches.map((b) => `${b.stepId} ${b.startMs}–${b.endMs} ms`).join(', '),
      },
      {
        id: 'measured-speedup',
        label: 'Running in parallel took less time than the branches one after the other',
        passed: out.timing !== null && out.timing.parallelSpanMs < out.timing.sumOfBranchesMs,
        message: out.timing
          ? `${out.timing.parallelSpanMs} ms vs ${out.timing.sumOfBranchesMs} ms (${out.latencySource})`
          : 'no timing',
      },
      {
        id: 'deterministic-merge',
        label: 'The merged record equals the pure merge of the branch outputs',
        passed: recomputed !== null && JSON.stringify(recomputed) === JSON.stringify(out.merged),
        message: `completion order: ${out.completionOrder.join(' then ')}`,
      },
    ]);
  },
};
