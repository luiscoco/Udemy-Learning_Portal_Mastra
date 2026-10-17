import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow, type IterationTrace } from '../shared/workflow-stream.js';
import { lab30Definition } from './definition.js';
import { BatchReportSchema, buildBatchWorkflow, DocumentSchema, InFlight, MAX_KEYWORDS, type BatchReport } from './batch.js';

export const Lab30InputSchema = z.object({
  documents: z
    .array(DocumentSchema)
    .max(12)
    .refine((d) => new Set(d.map((x) => x.docId)).size === d.length, { message: 'docId values must be unique' }),
  concurrency: z.number().int().min(1).max(4),
  failureHandling: z.enum(['capture', 'throw']),
  simulatedLatencyMs: z.number().int().min(0).max(2_000),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab30Input = z.infer<typeof Lab30InputSchema>;

export interface Lab30Output {
  workflowStatus: string;
  concurrency: number;
  peakInFlight: number;
  latencySource: string;
  inputOrder: string[];
  /** Order in which Mastra reported the iterations finishing (indexes into the input). */
  completionOrder: number[];
  iterations: Pick<IterationTrace, 'index' | 'status' | 'atMs'>[];
  aggregateRan: boolean;
  report: BatchReport | null;
  error: string | null;
}

const STOP = new Set('the a an and or of to in on for with is are was were be by this that it as at from we our you your'.split(' '));

/** Offline summary: first sentence plus the most frequent non-stopwords (deterministic). */
export function summarizeOffline(text: string): { summary: string; keywords: string[] } {
  const body = text.replace(/^Title:.*\n+/, '');
  const first = (body.split(/(?<=[.!?])\s/)[0] ?? body).trim();
  const freq = new Map<string, number>();
  for (const w of body.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const keywords = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w);
  return { summary: first.length > 160 ? `${first.slice(0, 157)}…` : first, keywords };
}

export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({ text: JSON.stringify(summarizeOffline(v.lastUser)) });
}

export const lab30: LabImplementation<Lab30Input, Lab30Output, LabServices> = {
  definition: lab30Definition as LabDefinition,
  inputSchema: Lab30InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'document-summarizer',
        name: 'Document Summarizer',
        instructions: `Summarise the document in one sentence and list up to ${MAX_KEYWORDS} keywords (single lowercase words).`,
        model: resolved.model,
      }),
    );
    // Offline, the latency is simulated; live, the provider's real latency applies and no delay is added.
    const simulatedLatencyMs = resolved.simulated ? input.simulatedLatencyMs : 0;
    const inFlight = new InFlight();
    const workflow = buildBatchWorkflow(agent, {
      concurrency: input.concurrency,
      failureHandling: input.failureHandling,
      simulatedLatencyMs,
      inFlight,
      signal: ctx.signal,
    });
    ctx.log('info', `Processing ${input.documents.length} document(s), at most ${input.concurrency} at a time.`);
    const res = await runTypedWorkflow(ctx, 'document-batch', await workflow.createRun(), input.documents, BatchReportSchema);
    const iterations = res.iterations.filter((i) => i.stepId === 'processDocument');
    const report = res.typed;
    if (report) ctx.log(report.status === 'complete' || report.status === 'empty' ? 'info' : 'warn', `Batch ${report.status}: ${report.succeeded} ok, ${report.failed} failed.`);
    else ctx.log('error', `Workflow ${res.status}: ${res.error ?? 'no report'}; results of successful items were not kept.`);
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, concurrency: input.concurrency, failureHandling: input.failureHandling },
    });
    return {
      workflowStatus: res.status,
      concurrency: input.concurrency,
      peakInFlight: inFlight.peak,
      latencySource: resolved.simulated ? `simulated latency (${simulatedLatencyMs} ms per item, offline)` : 'real provider latency',
      inputOrder: input.documents.map((d) => d.docId),
      completionOrder: iterations.map((i) => i.index),
      iterations: iterations.map(({ index, status, atMs }) => ({ index, status, atMs })),
      aggregateRan: res.stepRecords.aggregate?.status === 'success',
      report,
      error: res.error ?? null,
    };
  },

  validate(out) {
    const r = out.report;
    const ids = r?.results.map((x) => x.docId) ?? [];
    const failures = r?.results.filter((x) => !x.ok) ?? [];
    return summarizeChecks([
      {
        id: 'all-accounted',
        label: 'Every document has exactly one result, in input order',
        passed: r !== null && JSON.stringify(ids) === JSON.stringify(out.inputOrder),
        message: r ? `${ids.length}/${out.inputOrder.length} result(s)` : 'no report: the workflow did not finish',
      },
      {
        id: 'concurrency-bounded',
        label: 'Measured concurrency never exceeded the limit',
        passed: out.peakInFlight <= out.concurrency,
        message: `peak ${out.peakInFlight} in flight, limit ${out.concurrency}`,
      },
      {
        id: 'partial-failures-kept',
        label: 'Failed documents carry a typed error and successful results are kept',
        passed: r !== null && failures.every((x) => !x.ok && x.error.code.length > 0) && r.succeeded + r.failed === r.total,
        message: r ? `${r.succeeded} kept, ${r.failed} typed failure(s)` : 'the whole batch was lost',
      },
      {
        id: 'aggregated',
        label: 'The aggregate step ran and its counts match the results',
        passed: out.aggregateRan && r !== null && r.total === r.results.length,
        message: r ? `status ${r.status}` : 'aggregate did not run',
      },
    ]);
  },
};
