import { z } from 'zod';

/**
 * Several experiments (configurations) on one dataset version, compared against a baseline. Every metric
 * states its source; cost is only present when the provider reported it. Labs put it at
 * `output.comparison`; the web Run tab renders it and offers the exports as downloads.
 */
export const ComparisonMetricsSchema = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  passRate: z.number().min(0).max(1),
  meanScore: z.number().min(0).max(1).nullable(),
  scorable: z.number().int(),
  tokens: z.object({
    input: z.number().nullable(),
    output: z.number().nullable(),
    total: z.number().nullable(),
    /** simulated = counted by the mock provider; provider = reported by the model provider. */
    source: z.enum(['simulated', 'provider', 'unavailable']),
  }),
  latencyMs: z.object({ p50: z.number().nullable(), p95: z.number().nullable(), mean: z.number().nullable() }),
  cost: z.object({
    value: z.number().nullable(),
    unit: z.string().max(20).nullable(),
    source: z.enum(['provider']).nullable(),
    note: z.string().max(300),
  }),
});
export type ComparisonMetrics = z.infer<typeof ComparisonMetricsSchema>;

export const ComparisonDeltasSchema = z.object({
  passRate: z.number().nullable(),
  meanScore: z.number().nullable(),
  tokensTotal: z.number().nullable(),
  latencyP50: z.number().nullable(),
  regressions: z.number().int(),
  improvements: z.number().int(),
});

export const ComparisonConfigSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(120),
  experimentId: z.string().max(80),
  modelId: z.string().max(120),
  provider: z.string().max(80),
  simulated: z.boolean(),
  tools: z.array(z.string().max(80)).max(20),
  metrics: ComparisonMetricsSchema,
  /** null for the baseline. */
  deltas: ComparisonDeltasSchema.nullable(),
});
export type ComparisonConfig = z.infer<typeof ComparisonConfigSchema>;

export const ExperimentComparisonSchema = z.object({
  datasetId: z.string().max(80),
  datasetVersion: z.number().int(),
  baselineConfigId: z.string().max(40),
  configs: z.array(ComparisonConfigSchema).min(1).max(10),
  items: z
    .array(
      z.object({
        externalId: z.string().max(120),
        title: z.string().max(200),
        results: z.record(z.string(), z.object({ passed: z.boolean(), score: z.number().nullable() })),
        changes: z.record(z.string(), z.enum(['regression', 'improvement', 'same'])),
      }),
    )
    .max(500),
  notes: z.array(z.string().max(400)).max(20),
  export: z.object({ json: z.string().max(500_000), csv: z.string().max(100_000), filename: z.string().max(120) }),
});
export type ExperimentComparison = z.infer<typeof ExperimentComparisonSchema>;
