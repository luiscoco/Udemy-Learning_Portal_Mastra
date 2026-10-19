import { z } from 'zod';

/**
 * A trace from Mastra's observability, flattened for the browser: one entry per span with its parent,
 * timing relative to the root, status and a few safe attributes. Labs put it at `output.traceTree`;
 * the web Run tab renders it as a nested span tree (text only).
 */
export const TraceSpanSchema = z.object({
  id: z.string().min(1).max(64),
  parentId: z.string().max(64).nullable(),
  traceId: z.string().max(64),
  name: z.string().max(200),
  /** Mastra span type, e.g. workflow_run, workflow_step, agent_run, model_generation, tool_call. */
  type: z.string().max(64),
  entity: z.string().max(120).nullable(),
  startMs: z.number().min(0),
  durationMs: z.number().min(0).nullable(),
  status: z.enum(['ok', 'error', 'open']),
  /** Error message only (never a stack trace). */
  error: z.string().max(300).nullable(),
  attributes: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])),
  correlationId: z.string().max(120).nullable(),
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceTreeSchema = z.object({
  traceId: z.string().max(64).nullable(),
  rootSpanId: z.string().max(64).nullable(),
  correlation: z.object({
    labRunId: z.string().max(120),
    correlationId: z.string().max(120),
    workflowRunId: z.string().max(120).nullable(),
  }),
  view: z.enum(['summary', 'full']),
  spans: z.array(TraceSpanSchema).max(600),
  /** Spans left out of this view (their children are re-parented to the nearest shown ancestor). */
  hiddenSpans: z.number().int().min(0),
  findings: z.array(z.string().max(300)).max(50),
});
export type TraceTree = z.infer<typeof TraceTreeSchema>;
