import { z } from 'zod';

/**
 * One experiment over a versioned evaluation dataset: the dataset and its versions, the experiment, and
 * every item with its answer, scores and expected assertions. Labs put it at `output.evalReport`; the
 * web Run tab renders it as text.
 */
export const EvalAssertionSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  passed: z.boolean(),
  detail: z.string().max(300),
});

export const EvalItemSchema = z.object({
  itemId: z.string().max(80),
  externalId: z.string().max(120).nullable(),
  title: z.string().max(200).nullable(),
  /** The dataset version in which this item's content was last changed. */
  itemVersion: z.number().int().nullable(),
  input: z.string().max(5_000),
  answer: z.string().max(5_000),
  scores: z
    .array(
      z.object({
        scorerId: z.string().max(80),
        score: z.number().nullable(),
        reason: z.string().max(2_000).nullable(),
        notScorable: z.string().max(300).nullable(),
      }),
    )
    .max(20),
  assertions: z.array(EvalAssertionSchema).max(50),
  passed: z.boolean(),
  durationMs: z.number().min(0).nullable(),
  error: z.string().max(300).nullable(),
});
export type EvalItem = z.infer<typeof EvalItemSchema>;

export const EvalReportSchema = z.object({
  dataset: z.object({
    id: z.string().max(80),
    name: z.string().max(200),
    /** Latest dataset version. */
    version: z.number().int(),
    seedRevision: z.number().int(),
    /** Seed revision → dataset version. */
    revisionVersions: z.record(z.string(), z.number().int()),
    versions: z.array(z.object({ version: z.number().int(), createdAt: z.string().max(40) })).max(200),
  }),
  experiment: z.object({
    id: z.string().max(80),
    datasetVersion: z.number().int(),
    revision: z.number().int().nullable(),
    status: z.string().max(40),
    targetId: z.string().max(80),
    /** Model provider seen in the answers (offline-sim = the mock provider). */
    provider: z.string().max(80),
    startedAt: z.string().max(40),
    completedAt: z.string().max(40),
    durationMs: z.number().min(0),
  }),
  items: z.array(EvalItemSchema).max(500),
  summary: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    errored: z.number().int(),
    passRate: z.number().min(0).max(1),
  }),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
