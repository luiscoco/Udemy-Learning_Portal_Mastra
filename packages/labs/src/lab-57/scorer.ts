import { createScorer, notScorable } from '@mastra/core/evals';
import type { ScoreCard, ScoreCriterion } from '@mlp/contracts';
import type { Rubric } from './rubrics.js';
import { containsPhrase, sentences, tokens, wordCount } from './text.js';

export const SCORER_ID = 'rubric-answer-scorer';
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

interface Sentence {
  text: string;
  tokens: string[];
}
export interface Prepared {
  sentences: Sentence[];
  words: number;
}
export interface Analysis {
  covered: { id: string; label: string; evidence: string | null }[];
  onTopic: { text: string; onTopic: boolean }[];
  forbiddenHits: { id: string; label: string; sentence: string }[];
  overLength: boolean;
  words: number;
}
export interface Breakdown {
  completeness: number;
  relevance: number;
  forbiddenPenalty: number;
  lengthPenalty: number;
  score: number;
}

type Run = { run: { output: { answer: string }; groundTruth?: Rubric } };
type WithPre = { results: { preprocessStepResult: Prepared } } & Run;
type WithAnalysis = { results: { preprocessStepResult: Prepared; analyzeStepResult: Analysis } } & Run;

const matches = (s: Sentence, aliases: readonly string[]) => aliases.some((a) => containsPhrase(s.tokens, tokens(a)));

/** The arithmetic, in one place: used by generateScore, the reason and the score card. */
export function breakdownOf(rubric: Rubric, a: Analysis): Breakdown {
  const completeness = r4(a.covered.filter((c) => c.evidence).length / rubric.keyPoints.length);
  const relevance = a.onTopic.length ? r4(a.onTopic.filter((s) => s.onTopic).length / a.onTopic.length) : 0;
  const forbiddenPenalty = r4(a.forbiddenHits.length * rubric.penalties.forbidden);
  const lengthPenalty = a.overLength ? rubric.penalties.overLength : 0;
  const raw =
    rubric.weights.completeness * completeness + rubric.weights.relevance * relevance - forbiddenPenalty - lengthPenalty;
  return { completeness, relevance, forbiddenPenalty, lengthPenalty, score: r4(Math.min(1, Math.max(0, raw))) };
}

export const formulaOf = (rubric: Rubric, b: Breakdown) =>
  `clamp(${rubric.weights.completeness} × ${b.completeness} + ${rubric.weights.relevance} × ${b.relevance} − ${b.forbiddenPenalty} − ${b.lengthPenalty}, 0, 1) = ${b.score}`;

/**
 * A deterministic rubric scorer built with Mastra's createScorer. The rubric (expected output) travels as
 * groundTruth, so one scorer instance serves every rubric.
 */
export function createRubricScorer() {
  return createScorer({
    id: SCORER_ID,
    description:
      'Scores an answer for completeness (expected key points) and relevance (on-topic sentences), with penalties for known-wrong claims and length.',
  })
    .preprocess(({ run }: Run) => {
      const answer = run.output.answer ?? '';
      const words = wordCount(answer);
      if (!run.groundTruth) return notScorable('no rubric was given');
      if (words < 3) return notScorable('the answer has fewer than 3 words');
      return { sentences: sentences(answer).map((text) => ({ text, tokens: tokens(text) })), words } satisfies Prepared;
    })
    .analyze(({ run, results }: WithPre): Analysis => {
      const rubric = run.groundTruth!;
      const ss = results.preprocessStepResult.sentences;
      const topic = new Set(rubric.topicTerms.flatMap((t) => tokens(t)));
      const covered = rubric.keyPoints.map((k) => ({
        id: k.id,
        label: k.label,
        evidence: ss.find((s) => matches(s, k.aliases))?.text ?? null,
      }));
      return {
        covered,
        onTopic: ss.map((s) => ({
          text: s.text,
          onTopic: s.tokens.some((t) => topic.has(t)) || rubric.keyPoints.some((k) => matches(s, k.aliases)),
        })),
        forbiddenHits: rubric.forbidden.flatMap((f) => {
          const s = ss.find((x) => matches(x, f.aliases));
          return s ? [{ id: f.id, label: f.label, sentence: s.text }] : [];
        }),
        overLength: results.preprocessStepResult.words > rubric.maxWords,
        words: results.preprocessStepResult.words,
      };
    })
    .generateScore(({ run, results }: WithAnalysis) => breakdownOf(run.groundTruth!, results.analyzeStepResult).score)
    .generateReason(({ run, results }: WithAnalysis) => {
      const rubric = run.groundTruth!;
      const a = results.analyzeStepResult;
      const b = breakdownOf(rubric, a);
      const missing = a.covered.filter((c) => !c.evidence).map((c) => c.label);
      const off = a.onTopic.filter((s) => !s.onTopic).length;
      return [
        `Completeness ${a.covered.length - missing.length}/${a.covered.length} key points${missing.length ? ` (missing: ${missing.join('; ')})` : ''}.`,
        `Relevance ${a.onTopic.length - off}/${a.onTopic.length} sentences on topic.`,
        a.forbiddenHits.length
          ? `Known-wrong claims: ${a.forbiddenHits.map((f) => f.label).join('; ')} (−${b.forbiddenPenalty}).`
          : 'No known-wrong claims.',
        a.overLength
          ? `Over the ${rubric.maxWords}-word limit (${a.words} words, −${b.lengthPenalty}).`
          : `Length ${a.words}/${rubric.maxWords} words.`,
        `Score = ${formulaOf(rubric, b)}.`,
      ].join(' ');
    });
}
export type RubricScorer = ReturnType<typeof createRubricScorer>;

export interface ScorerRunResult {
  score?: number;
  reason?: string;
  analyzeStepResult?: Analysis;
  notScorable?: { step: string; reason: string };
}

export async function scoreAnswer(scorer: RubricScorer, rubric: Rubric, answer: string): Promise<ScorerRunResult> {
  return (await scorer.run({
    input: { question: rubric.question },
    output: { answer },
    groundTruth: rubric,
  } as never)) as ScorerRunResult;
}

/** Turns a scorer run into the ScoreCard contract (without fixtures). */
export function toScoreCard(rubric: Rubric, answer: string, r: ScorerRunResult): Omit<ScoreCard, 'fixtures'> {
  const common = {
    scorerId: SCORER_ID,
    rubricId: rubric.id,
    question: rubric.question,
    answer: answer.slice(0, 5_000),
    reference: rubric.reference,
    keyPoints: rubric.keyPoints.map(({ id, label }) => ({ id, label })),
    passThreshold: rubric.passThreshold,
  };
  if (r.notScorable || !r.analyzeStepResult || r.score === undefined)
    return {
      ...common,
      score: null,
      notScorable: r.notScorable?.reason ?? 'not scored',
      passed: null,
      criteria: [],
      formula: '',
      reason: r.notScorable?.reason ?? '',
    };
  const a = r.analyzeStepResult;
  const b = breakdownOf(rubric, a);
  const criteria: ScoreCriterion[] = [
    {
      id: 'completeness',
      label: 'Expected key points covered',
      kind: 'completeness',
      weight: rubric.weights.completeness,
      score: b.completeness,
      contribution: r4(rubric.weights.completeness * b.completeness),
      evidence: a.covered.filter((c) => c.evidence).map((c) => `${c.label}: “${c.evidence}”`),
      missing: a.covered.filter((c) => !c.evidence).map((c) => c.label),
    },
    {
      id: 'relevance',
      label: 'Sentences on topic',
      kind: 'relevance',
      weight: rubric.weights.relevance,
      score: b.relevance,
      contribution: r4(rubric.weights.relevance * b.relevance),
      evidence: a.onTopic.filter((s) => s.onTopic).map((s) => s.text),
      missing: a.onTopic.filter((s) => !s.onTopic).map((s) => `off topic: “${s.text}”`),
    },
    {
      id: 'forbidden-claims',
      label: 'Known-wrong claims',
      kind: 'penalty',
      weight: rubric.penalties.forbidden,
      score: a.forbiddenHits.length ? 0 : 1,
      contribution: -b.forbiddenPenalty,
      evidence: a.forbiddenHits.map((f) => `${f.label}: “${f.sentence}”`),
      missing: [],
    },
    {
      id: 'length',
      label: `At most ${rubric.maxWords} words`,
      kind: 'constraint',
      weight: rubric.penalties.overLength,
      score: a.overLength ? 0 : 1,
      contribution: -b.lengthPenalty,
      evidence: [`${a.words} words`],
      missing: [],
    },
  ];
  return {
    ...common,
    score: r.score,
    notScorable: null,
    passed: r.score >= rubric.passThreshold,
    criteria,
    formula: formulaOf(rubric, b),
    reason: r.reason ?? '',
  };
}
