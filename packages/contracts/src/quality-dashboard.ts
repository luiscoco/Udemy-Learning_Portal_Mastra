import { z } from 'zod';
import { TraceSpanSchema } from './trace-tree.js';

/**
 * A quality dashboard derived from stored evaluation runs: KPIs, run history, regressions, latency
 * percentiles and trace links. Every value may be null when there is no data; `empty` explains why.
 * Labs put it at `output.dashboard`; the web Run tab renders it as text.
 */
const Latency = z.object({ p50: z.number().nullable(), p95: z.number().nullable(), p99: z.number().nullable() });

export const DashboardRunSchema = z.object({
  experimentId: z.string().max(80),
  name: z.string().max(200),
  configId: z.string().max(40).nullable(),
  datasetVersion: z.number().int().nullable(),
  startedAt: z.string().max(40),
  total: z.number().int(),
  passed: z.number().int(),
  passRate: z.number().min(0).max(1),
  errored: z.number().int(),
  latency: Latency,
});
export type DashboardRun = z.infer<typeof DashboardRunSchema>;

const ItemRef = z.object({
  externalId: z.string().max(120),
  title: z.string().max(200),
  failedAssertions: z.array(z.string().max(300)).max(20),
  traceId: z.string().max(64).nullable(),
});

export const QualityDashboardSchema = z.object({
  datasetId: z.string().max(80),
  datasetVersion: z.number().int().nullable(),
  window: z.number().int().min(1),
  empty: z.object({
    isEmpty: z.boolean(),
    reason: z.enum(['no-dataset', 'no-runs']).nullable(),
    message: z.string().max(400),
    actions: z.array(z.string().max(200)).max(5),
  }),
  kpis: z.object({
    runs: z.number().int(),
    latestPassRate: z.number().nullable(),
    previousPassRate: z.number().nullable(),
    passRateDelta: z.number().nullable(),
    latestP50: z.number().nullable(),
    latestP95: z.number().nullable(),
    regressions: z.number().int().nullable(),
  }),
  runs: z.array(DashboardRunSchema).max(50),
  regressions: z.object({
    needsTwoRuns: z.boolean(),
    items: z.array(ItemRef.extend({ previousExperimentId: z.string().max(80), latestExperimentId: z.string().max(80) })).max(200),
  }),
  latestItems: z
    .array(ItemRef.extend({ passed: z.boolean(), durationMs: z.number().nullable(), error: z.string().max(300).nullable() }))
    .max(200),
  /** Stored traces by trace id (L56 TraceSpan shape); a linked trace that could not be read is absent. */
  traces: z.record(z.string(), z.array(TraceSpanSchema).max(60)),
  notes: z.array(z.string().max(400)).max(20),
});
export type QualityDashboard = z.infer<typeof QualityDashboardSchema>;
