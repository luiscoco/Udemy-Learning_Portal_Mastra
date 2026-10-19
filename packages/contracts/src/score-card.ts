import { z } from 'zod';

/**
 * A deterministic score with its full rationale: every criterion's weight, sub-score, contribution,
 * evidence and missing items, the formula with numbers, and the scorer's golden-fixture results.
 * Labs put it at `output.scoreCard`; the web Run tab renders it as text.
 */
export const ScoreCriterionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(200),
  kind: z.enum(['completeness', 'relevance', 'penalty', 'constraint']),
  /** Weight for positive criteria; the penalty amount (per hit) for penalties. */
  weight: z.number(),
  score: z.number().min(0).max(1),
  /** Signed contribution to the final score. */
  contribution: z.number(),
  evidence: z.array(z.string().max(600)).max(50),
  missing: z.array(z.string().max(300)).max(50),
});
export type ScoreCriterion = z.infer<typeof ScoreCriterionSchema>;

export const ScoreFixtureResultSchema = z.object({
  name: z.string().max(200),
  rubricId: z.string().max(64),
  expectedScore: z.number().nullable(),
  actualScore: z.number().nullable(),
  expectedPassed: z.boolean().nullable(),
  actualPassed: z.boolean().nullable(),
  ok: z.boolean(),
  detail: z.string().max(300),
});
export type ScoreFixtureResult = z.infer<typeof ScoreFixtureResultSchema>;

export const ScoreCardSchema = z.object({
  scorerId: z.string().max(80),
  rubricId: z.string().max(64),
  question: z.string().max(1_000),
  answer: z.string().max(5_000),
  /** The expected output the rubric was written from. */
  reference: z.string().max(5_000),
  keyPoints: z.array(z.object({ id: z.string().max(64), label: z.string().max(200) })).max(20),
  score: z.number().min(0).max(1).nullable(),
  notScorable: z.string().max(300).nullable(),
  passThreshold: z.number().min(0).max(1),
  passed: z.boolean().nullable(),
  criteria: z.array(ScoreCriterionSchema).max(20),
  formula: z.string().max(500),
  reason: z.string().max(2_000),
  fixtures: z.array(ScoreFixtureResultSchema).max(100),
});
export type ScoreCard = z.infer<typeof ScoreCardSchema>;
