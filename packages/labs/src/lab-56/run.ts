import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { Observability } from '@mastra/observability';
import { summarizeChecks, type LabDefinition, type TraceSpan, type TraceTree } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamWorkflow } from '../shared/workflow-stream.js';
import { analyseCoherence, type Coherence } from './coherence.js';
import { analyseLifecycle, SpanCollector } from './collector.js';
import { lab56Definition } from './definition.js';
import {
  AGENT_IDS,
  buildPipeline,
  FAULTS,
  INSTRUCTIONS,
  researcherScript,
  reviewerScript,
  searchTool,
  WORKFLOW_ID,
  writerScript,
  type CallLogEntry,
} from './pipeline.js';
import { SUMMARY_TYPES, toTraceSpans, viewOf } from './tree.js';

export const Lab56InputSchema = z.object({
  question: z.string().trim().min(5).max(500),
  fault: z.enum(FAULTS),
  view: z.enum(['summary', 'full']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab56Input = z.infer<typeof Lab56InputSchema>;

export interface Lab56Output {
  workflowStatus: string;
  /** From the workflow run result: the ids the trace must match. */
  result: { traceId: string | null; spanId: string | null; runId: string };
  lifecycle: { started: number; ended: number; missingEnd: string[]; endedWithoutStart: string[]; endedTwice: string[] };
  /** Every span (full detail), for the checks. The browser view is traceTree. */
  spans: TraceSpan[];
  /** Metadata and tags as Mastra exported them, by span id (only the fields the checks need). */
  spanMeta: Record<string, { correlationId: string | null; labRunId: string | null; runId: string | null; tags: string[] }>;
  calls: CallLogEntry[];
  coherence: Omit<Coherence, 'roots' | 'orphans' | 'outsideParent' | 'misplacedSteps' | 'strayTools'> & {
    roots: string[];
    orphans: string[];
    outsideParent: string[];
    misplacedSteps: string[];
    strayTools: string[];
  };
  answer: string | null;
  traceTree: TraceTree;
}

export const lab56: LabImplementation<Lab56Input, Lab56Output, LabServices> = {
  definition: lab56Definition as LabDefinition,
  inputSchema: Lab56InputSchema,

  async run(ctx, input) {
    const scripts = { researcher: researcherScript(), reviewer: reviewerScript(), writer: writerScript() };
    const resolve = (id: (typeof AGENT_IDS)[number]) =>
      ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: scripts[id] });
    const make = (id: (typeof AGENT_IDS)[number]) =>
      withLabLogger(
        ctx,
        new Agent({
          id,
          name: id,
          instructions: INSTRUCTIONS[id],
          model: resolve(id).model,
          ...(id === 'researcher' ? { tools: { search_sources: searchTool(input.fault) } } : {}),
        }),
      );
    const agents = Object.fromEntries(AGENT_IDS.map((id) => [id, make(id)]));
    const detachedReviewer = input.fault === 'detached-agent' ? make('reviewer') : null;
    if (detachedReviewer) ctx.log('warn', 'Fault: the review step uses an agent that is not registered on Mastra.');

    const collector = new SpanCollector((s) => {
      if (SUMMARY_TYPES.has(String(s.type)) && s.endTime && s.startTime)
        ctx.log(
          'info',
          `span ended: ${s.type} ${s.name} (${new Date(s.endTime).getTime() - new Date(s.startTime).getTime()} ms)`,
        );
    });
    const observability = new Observability({
      configs: { lab: { serviceName: 'mastra-learning-platform', exporters: [collector] } },
    });
    const calls: CallLogEntry[] = [];
    const workflow = buildPipeline({ calls, detachedReviewer, signal: ctx.signal });
    const mastra = new Mastra({ agents, workflows: { [WORKFLOW_ID]: workflow }, logger: noopLogger, observability });

    const run = await mastra.getWorkflow(WORKFLOW_ID).createRun();
    const tracingOptions = { metadata: { correlationId: ctx.correlationId, labRunId: ctx.runId }, tags: ['lab-56'] };
    let started: { result: PromiseLike<unknown> } | null = null;
    let res: Awaited<ReturnType<typeof streamWorkflow>>;
    try {
      res = await streamWorkflow(
        ctx as RunContext<unknown>,
        WORKFLOW_ID,
        {
          stream: () => {
            const s = run.stream({ inputData: { question: input.question }, tracingOptions } as never);
            started = s;
            return s;
          },
          cancel: () => run.cancel(),
        },
        { question: input.question },
      );
    } finally {
      // Deterministic export: flush the exporters, then release the instance (no sleeping).
      await observability.flush();
      await observability.shutdown();
    }
    const final = (await (started as { result: PromiseLike<unknown> } | null)?.result) as
      { traceId?: string; spanId?: string } | undefined;
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolve('researcher').simulated,
        view: input.view,
        observability: '@mastra/observability 1.20.1',
      },
    });

    const life = analyseLifecycle(collector.events);
    const exported = [...life.spans.values()];
    const spans = toTraceSpans(exported);
    const coherence = analyseCoherence(spans, calls);
    const findings = [
      ...coherence.agentCalls
        .filter((c) => !c.spanId)
        .map(
          (c) =>
            `Untraced work: step ${c.stepId} called agent ${c.agentId}, but no agent_run span exists${c.registered ? '' : ' (the agent is not registered on Mastra)'}.`,
        ),
      ...spans.filter((s) => s.status === 'error').map((s) => `Error on ${s.type} ${s.name}: ${s.error}`),
      ...coherence.orphans.map((s) => `Orphan span ${s.name}: its parent is not in the trace.`),
    ];
    for (const f of findings) ctx.log('warn', f);
    const simulated = resolve('researcher').simulated;
    if (simulated)
      findings.push(
        `Offline: the model spans name the requested model (${input.modelId}), but a scripted model answered; the spans themselves are real Mastra spans.`,
      );
    const view = viewOf(spans, input.view);
    const ids = (xs: TraceSpan[]) => xs.map((s) => s.id);
    return {
      workflowStatus: res.status,
      result: { traceId: final?.traceId ?? null, spanId: final?.spanId ?? null, runId: run.runId },
      lifecycle: {
        started: life.started.size,
        ended: life.ended.size,
        missingEnd: life.missingEnd,
        endedWithoutStart: life.endedWithoutStart,
        endedTwice: life.endedTwice,
      },
      spans,
      spanMeta: Object.fromEntries(
        exported.map((s) => [
          s.id,
          {
            correlationId: typeof s.metadata?.correlationId === 'string' ? s.metadata.correlationId : null,
            labRunId: typeof s.metadata?.labRunId === 'string' ? s.metadata.labRunId : null,
            runId: typeof s.metadata?.runId === 'string' ? s.metadata.runId : null,
            tags: s.tags ?? [],
          },
        ]),
      ),
      calls,
      coherence: {
        ...coherence,
        roots: ids(coherence.roots),
        orphans: ids(coherence.orphans),
        outsideParent: ids(coherence.outsideParent),
        misplacedSteps: ids(coherence.misplacedSteps),
        strayTools: ids(coherence.strayTools),
      },
      answer: res.status === 'success' ? String((res.result as { answer?: string } | undefined)?.answer ?? '') : null,
      traceTree: {
        traceId: final?.traceId ?? null,
        rootSpanId: final?.spanId ?? null,
        correlation: { labRunId: ctx.runId, correlationId: ctx.correlationId, workflowRunId: run.runId },
        view: input.view,
        spans: view.spans.slice(0, 600),
        hiddenSpans: view.hidden,
        findings: findings.slice(0, 50),
      },
    };
  },

  validate(out, input, vctx) {
    const l = out.lifecycle;
    const c = out.coherence;
    const root = out.spans.find((s) => s.id === c.roots[0]);
    const completeOk = l.missingEnd.length === 0 && l.endedWithoutStart.length === 0 && l.endedTwice.length === 0 && l.ended > 0;
    const singleOk =
      c.traceIds.length === 1 &&
      c.traceIds[0] === out.result.traceId &&
      c.roots.length === 1 &&
      c.roots[0] === out.result.spanId &&
      root?.type === 'workflow_run';
    const parentsOk =
      c.orphans.length === 0 && c.outsideParent.length === 0 && c.misplacedSteps.length === 0 && c.strayTools.length === 0;
    const agentsOk = c.agentCalls.every((a) => (a.registered ? a.spanId !== null : a.spanId === null));

    const correlationId = out.traceTree.correlation.correlationId;
    const metas = Object.values(out.spanMeta);
    const rootMeta = root ? out.spanMeta[root.id] : undefined;
    const correlationOk =
      metas.length > 0 &&
      metas.every((m) => m.correlationId === correlationId && m.labRunId === out.traceTree.correlation.labRunId) &&
      !!rootMeta?.tags.includes('lab-56') &&
      rootMeta.runId === out.result.runId &&
      out.traceTree.correlation.workflowRunId === out.result.runId &&
      // The SSE events of this run carry the same correlation id as the spans.
      (vctx?.events ?? []).every(
        (e) => !('correlationId' in e) || (e as { correlationId?: string }).correlationId === correlationId,
      );

    const errors = out.spans.filter((s) => s.status === 'error');
    const errorsOk =
      out.workflowStatus === 'success' &&
      (input.fault === 'tool-error'
        ? errors.length === 1 && errors[0]!.type === 'tool_call' && /simulated 503/.test(errors[0]!.error ?? '')
        : errors.length === 0) &&
      out.spans.every((s) => !s.error || !/\bat \S+:\d+:\d+/.test(s.error));

    const untraced = c.agentCalls.filter((a) => a.spanId === null);
    const reported = out.traceTree.findings.filter((f) => f.startsWith('Untraced work'));
    const untracedOk =
      untraced.length === reported.length &&
      (input.fault === 'detached-agent' ? untraced.length === 1 && untraced[0]!.stepId === 'review' : untraced.length === 0);

    return summarizeChecks([
      {
        id: 'spans-complete',
        label: 'Every started span ended exactly once',
        passed: completeOk,
        message: `${l.started} started, ${l.ended} ended; missing end: ${l.missingEnd.length}, end without start: ${l.endedWithoutStart.length}, ended twice: ${l.endedTwice.length}`,
      },
      {
        id: 'single-trace',
        label: 'All spans belong to the run’s trace, under one workflow-run root',
        passed: singleOk,
        message: `trace ids: ${c.traceIds.length}; roots: ${c.roots.length} (${root?.type ?? 'none'}); result trace ${out.result.traceId?.slice(0, 8) ?? 'none'}…`,
      },
      {
        id: 'parent-child-coherent',
        label: 'Every span has its parent in the trace and inside its time window; steps, agents and tools nest correctly',
        passed: parentsOk && agentsOk,
        message: `orphans ${c.orphans.length}, outside parent ${c.outsideParent.length}, misplaced steps ${c.misplacedSteps.length}, stray tools ${c.strayTools.length}; agent runs under their steps: ${c.agentCalls.map((a) => `${a.stepId}→${a.agentId} ${a.spanId ? 'yes' : 'no'}`).join(', ')}`,
      },
      {
        id: 'correlation-propagated',
        label: 'Every span carries the lab correlation id and run id; the root carries the tag and the workflow run id',
        passed: correlationOk,
        message: `${metas.filter((m) => m.correlationId === correlationId).length}/${metas.length} spans with correlation id ${correlationId.slice(0, 8)}…`,
      },
      {
        id: 'errors-attributed',
        label: 'A tool failure is recorded on its own tool span (message only, no stack), and the run still succeeds',
        passed: errorsOk,
        message: errors.length ? errors.map((e) => `${e.type} ${e.name}: ${e.error}`).join('; ') : 'no error spans',
      },
      {
        id: 'untraced-work-detected',
        label: 'Agent work that left no spans is detected and reported',
        passed: untracedOk,
        message: untraced.length ? reported.join(' ') : 'every agent call has its agent_run span',
      },
    ]);
  },
};
