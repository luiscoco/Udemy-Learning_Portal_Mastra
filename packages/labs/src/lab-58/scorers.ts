import { createScorer, notScorable } from '@mastra/core/evals';
import { RUBRICS } from '../lab-57/rubrics.js';
import { createRubricScorer, scoreAnswer } from '../lab-57/scorer.js';
import { containsPhrase, tokens } from '../lab-57/text.js';
import { AssertionsSchema, type Assertions } from './scenarios.js';

/**
 * The answer text from a scorer run output. For an agent target, Mastra experiments pass the assistant
 * messages (content.content holds the text); a task target passes its own return value.
 */
export function answerText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output))
    return output
      .filter((m) => (m as { role?: string })?.role === 'assistant')
      .map((m) => {
        const c = (m as { content?: unknown }).content;
        return typeof c === 'string' ? c : String((c as { content?: unknown } | undefined)?.content ?? '');
      })
      .join('\n')
      .trim();
  const o = output as { text?: unknown; answer?: unknown } | undefined;
  return String(o?.text ?? o?.answer ?? '');
}

const assertionsOf = (g: unknown): Assertions | null => {
  const p = AssertionsSchema.safeParse(g);
  return p.success ? p.data : null;
};

/** The L57 rubric scorer, reading agent messages and looking the rubric up from the scenario's assertions. */
export const createDatasetRubricScorer = () =>
  createRubricScorer({
    id: 'scenario-rubric',
    answerOf: answerText,
    rubricOf: (g) => {
      const id = assertionsOf(g)?.rubricId;
      return id ? RUBRICS[id] : undefined;
    },
  });

export interface AssertionResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

/** Evaluates one scenario's expected assertions against an answer (deterministic). */
export async function evaluateAssertions(answer: string, a: Assertions): Promise<AssertionResult[]> {
  const out: AssertionResult[] = [];
  const words = tokens(answer);
  if (a.rubricId && a.minScore !== null) {
    const rubric = RUBRICS[a.rubricId];
    const r = rubric ? await scoreAnswer(createRubricScorer(), rubric, answer) : null;
    const score = r && !r.notScorable ? (r.score ?? null) : null;
    out.push({
      id: 'min-score',
      label: `Rubric ${a.rubricId} score ≥ ${a.minScore}`,
      passed: score !== null && score >= a.minScore,
      detail:
        score === null
          ? `not scorable: ${r?.notScorable?.reason ?? 'unknown rubric'}`
          : `${score} ${score >= a.minScore ? '≥' : '<'} ${a.minScore}`,
    });
  }
  for (const p of a.mustMention) {
    const hit = containsPhrase(words, tokens(p));
    out.push({ id: `mentions:${p}`, label: `Mentions “${p}”`, passed: hit, detail: hit ? 'found' : 'not found' });
  }
  for (const p of a.mustNotMention) {
    const hit = containsPhrase(words, tokens(p));
    out.push({ id: `avoids:${p}`, label: `Does not mention “${p}”`, passed: !hit, detail: hit ? 'found' : 'absent' });
  }
  return out;
}

/** A Mastra scorer over the scenario's assertions: score = passed / total, reason lists every assertion. */
export const createAssertionsScorer = () =>
  createScorer({ id: 'scenario-assertions', description: 'Share of the scenario’s expected assertions that hold.' })
    .preprocess(({ run }: { run: { output: unknown; groundTruth?: unknown } }) => {
      const assertions = assertionsOf(run.groundTruth);
      if (!assertions) return notScorable('the scenario has no valid assertions');
      return { answer: answerText(run.output), assertions };
    })
    .analyze(async ({ results }: { results: { preprocessStepResult: { answer: string; assertions: Assertions } } }) => ({
      results: await evaluateAssertions(results.preprocessStepResult.answer, results.preprocessStepResult.assertions),
    }))
    .generateScore(({ results }: { results: { analyzeStepResult: { results: AssertionResult[] } } }) => {
      const r = results.analyzeStepResult.results;
      return r.length ? Math.round((r.filter((x) => x.passed).length / r.length) * 10_000) / 10_000 : 1;
    })
    .generateReason(({ results }: { results: { analyzeStepResult: { results: AssertionResult[] } } }) =>
      results.analyzeStepResult.results.map((x) => `${x.passed ? '✓' : '✗'} ${x.label} (${x.detail})`).join('; '),
    );

/** Providers recorded on the agent's answer messages (content.metadata.provider). */
export function providersOf(output: unknown): string[] {
  if (!Array.isArray(output)) return [];
  const ps = output
    .map((m) => (m as { content?: { metadata?: { provider?: unknown } } })?.content?.metadata?.provider)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
  return [...new Set(ps)];
}

/**
 * Provenance: which model provider produced the answer, read from the messages Mastra hands the scorer
 * (the experiment summary's output does not carry it). offline-sim is the scripted mock provider.
 */
export const PROVENANCE_ID = 'answer-provenance';
export const createProvenanceScorer = () =>
  createScorer({ id: PROVENANCE_ID, description: 'Which model provider produced the answer (from the agent messages).' })
    .preprocess(({ run }: { run: { output: unknown } }) => ({ providers: providersOf(run.output) }))
    .generateScore(({ results }: { results: { preprocessStepResult: { providers: string[] } } }) =>
      results.preprocessStepResult.providers.length ? 1 : 0,
    )
    .generateReason(
      ({ results }: { results: { preprocessStepResult: { providers: string[] } } }) =>
        results.preprocessStepResult.providers.join(', ') || 'unknown',
    );
