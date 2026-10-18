import { createScorer, notScorable } from '@mastra/core/evals';

/** One evaluated item: what the pipeline produced, plus the ground truth it is measured against. */
export interface EvalInput {
  itemId: string;
  question: string;
}
export interface EvalOutput {
  retrieved: string[];
  /** The model's raw claims and whether the L44 guard verified each. */
  verdicts: { text: string; accepted: boolean }[];
  shownClaims: number;
}
export interface GroundTruth {
  relevant: string[];
  answerable: boolean;
}

/** Mastra's ScorerRun has input and groundTruth optional; this suite always passes both. */
type Run = { run: { input?: EvalInput; output: EvalOutput; groundTruth?: GroundTruth } };
const truth = (r: Run['run']) => r.groundTruth ?? { relevant: [], answerable: true };
type Results<T> = { results: { preprocessStepResult: T } };
const pct = (a: number, b: number) => Math.round((a / b) * 10_000) / 10_000;

/**
 * Deterministic, code-based scorers built with Mastra's createScorer. Each one states its arithmetic in
 * the reason and returns notScorable() when the metric does not apply to the item.
 */
export function createMetrics() {
  const hitRate = createScorer({
    id: 'retrieval-hit-rate',
    description: 'Was any ground-truth passage among the retrieved passages?',
  })
    .preprocess(({ run }: Run) => {
      if (truth(run).relevant.length === 0) return notScorable('no relevant passage exists for this item');
      const found = truth(run).relevant.filter((id) => run.output.retrieved.includes(id));
      return { found, relevant: truth(run).relevant.length };
    })
    .generateScore(({ results }: Results<{ found: string[] }>) => (results.preprocessStepResult.found.length > 0 ? 1 : 0))
    .generateReason(({ results, score }: Results<{ found: string[]; relevant: number }> & { score: number }) =>
      score === 1
        ? `hit: retrieved ${results.preprocessStepResult.found.join(', ')}`
        : `miss: none of the ${results.preprocessStepResult.relevant} relevant passage(s) retrieved`,
    );

  const contextRelevance = createScorer({
    id: 'context-relevance',
    description: 'Share of retrieved passages that are relevant.',
  })
    .preprocess(({ run }: Run) => {
      if (run.output.retrieved.length === 0) return notScorable('nothing was retrieved');
      return {
        relevant: run.output.retrieved.filter((id) => truth(run).relevant.includes(id)).length,
        retrieved: run.output.retrieved.length,
      };
    })
    .generateScore(({ results }: Results<{ relevant: number; retrieved: number }>) =>
      pct(results.preprocessStepResult.relevant, results.preprocessStepResult.retrieved),
    )
    .generateReason(
      ({ results }: Results<{ relevant: number; retrieved: number }>) =>
        `${results.preprocessStepResult.relevant} of ${results.preprocessStepResult.retrieved} retrieved passage(s) are relevant`,
    );

  const faithfulness = createScorer({
    id: 'answer-faithfulness',
    description: 'Share of the model’s claims that the citation guard verified against the retrieved passages.',
  })
    .preprocess(({ run }: Run) => {
      if (run.output.verdicts.length === 0) return notScorable('the model made no claims');
      return { verified: run.output.verdicts.filter((v) => v.accepted).length, claims: run.output.verdicts.length };
    })
    .generateScore(({ results }: Results<{ verified: number; claims: number }>) =>
      pct(results.preprocessStepResult.verified, results.preprocessStepResult.claims),
    )
    .generateReason(
      ({ results }: Results<{ verified: number; claims: number }>) =>
        `${results.preprocessStepResult.verified} of ${results.preprocessStepResult.claims} claim(s) verified`,
    );

  const abstention = createScorer({ id: 'abstention', description: 'Unanswerable questions get no claims.' })
    .preprocess(({ run }: Run) =>
      truth(run).answerable ? notScorable('the item is answerable') : { shown: run.output.shownClaims },
    )
    .generateScore(({ results }: Results<{ shown: number }>) => (results.preprocessStepResult.shown === 0 ? 1 : 0))
    .generateReason(({ results }: Results<{ shown: number }>) =>
      results.preprocessStepResult.shown === 0
        ? 'abstained: no claims shown'
        : `answered anyway: ${results.preprocessStepResult.shown} claim(s) shown`,
    );

  const answerRate = createScorer({ id: 'answer-rate', description: 'Answerable questions get at least one verified claim.' })
    .preprocess(({ run }: Run) =>
      truth(run).answerable ? { shown: run.output.shownClaims } : notScorable('the item is unanswerable'),
    )
    .generateScore(({ results }: Results<{ shown: number }>) => (results.preprocessStepResult.shown > 0 ? 1 : 0))
    .generateReason(({ results }: Results<{ shown: number }>) =>
      results.preprocessStepResult.shown > 0
        ? `answered with ${results.preprocessStepResult.shown} verified claim(s)`
        : 'no verified claim for an answerable question',
    );

  return [hitRate, contextRelevance, faithfulness, abstention, answerRate] as const;
}

export const METRIC_IDS = [
  'retrieval-hit-rate',
  'context-relevance',
  'answer-faithfulness',
  'abstention',
  'answer-rate',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

export type ItemScore = { score: number; reason: string } | { notScorable: string };

/** Runs every metric on one item. */
export async function scoreItem(
  input: EvalInput,
  output: EvalOutput,
  groundTruth: GroundTruth,
): Promise<Record<MetricId, ItemScore>> {
  const out = {} as Record<MetricId, ItemScore>;
  for (const m of createMetrics()) {
    const r = (await m.run({ input, output, groundTruth } as never)) as {
      score?: number;
      reason?: string;
      notScorable?: { reason: string };
    };
    out[m.id as MetricId] = r.notScorable ? { notScorable: r.notScorable.reason } : { score: r.score!, reason: r.reason ?? '' };
  }
  return out;
}

export interface Aggregate {
  mean: number | null;
  sum: number;
  n: number;
  notScorable: number;
}

export function aggregate(scores: ItemScore[]): Aggregate {
  const scored = scores.filter((s): s is { score: number; reason: string } => 'score' in s);
  const sum = Math.round(scored.reduce((a, s) => a + s.score, 0) * 10_000) / 10_000;
  return {
    mean: scored.length ? Math.round((sum / scored.length) * 10_000) / 10_000 : null,
    sum,
    n: scored.length,
    notScorable: scores.length - scored.length,
  };
}

/** Summary lines built only from the aggregates (so every number can be re-derived). */
export function summaryLine(id: MetricId, a: Aggregate, gate: number) {
  if (a.mean === null) return `${id}: not applicable (n = 0, not scorable = ${a.notScorable}), gate ≥ ${gate}: N/A`;
  return `${id}: ${a.sum}/${a.n} = ${a.mean.toFixed(2)} (n = ${a.n}, not scorable = ${a.notScorable}), gate ≥ ${gate}: ${a.mean >= gate ? 'PASS' : 'FAIL'}`;
}
