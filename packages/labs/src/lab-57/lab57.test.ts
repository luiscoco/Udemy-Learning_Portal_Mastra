import { afterAll, describe, expect, it } from 'vitest';
import { ScoreCardSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab57Definition } from './definition.js';
import { GOLDEN, runGolden } from './golden.js';
import { RUBRICS } from './rubrics.js';
import { lab57, type Lab57Output } from './run.js';
import { breakdownOf, createRubricScorer, scoreAnswer } from './scorer.js';
import { containsPhrase, stem, tokens } from './text.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab57]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab57Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-57', { input: { ...lab57Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}

describe('lab-57 text helpers (unit)', () => {
  it('stems and matches phrases deterministically', () => {
    expect(['steps', 'running', 'validated', 'validates', 'resume', 'resumed', 'run'].map(stem)).toEqual([
      'step',
      'run',
      'validat',
      'validat',
      'resum',
      'resum',
      'run',
    ]);
    expect(containsPhrase(tokens('Each step declares an input schema.'), tokens('input schemas'))).toBe(true);
    expect(containsPhrase(tokens('a fixed, explicit order'), tokens('fixed order'))).toBe(false);
  });
});

describe('lab-57 scorer (unit)', () => {
  const scorer = createRubricScorer();
  it('passes every golden fixture, and the expected scores follow the formula', async () => {
    const results = await runGolden(scorer);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(GOLDEN.length);
    // Independent arithmetic for one fixture: 0.6 × round4(2/3) + 0.4 × 1.
    expect(Math.round((0.6 * 0.6667 + 0.4) * 10_000) / 10_000).toBe(GOLDEN[1]!.expectedScore);
  });
  it('returns notScorable without a score, and the breakdown matches the score', async () => {
    const empty = await scoreAnswer(scorer, RUBRICS['workflow-steps']!, '  ');
    expect(empty.notScorable).toEqual({ step: 'preprocess', reason: 'the answer has fewer than 3 words' });
    expect(empty.score).toBeUndefined();
    const r = await scoreAnswer(scorer, RUBRICS['tool-validation']!, 'Mastra checks the tool input schema.');
    expect(breakdownOf(RUBRICS['tool-validation']!, r.analyzeStepResult!)).toEqual({
      completeness: 0.25,
      relevance: 1,
      forbiddenPenalty: 0,
      lengthPenalty: 0,
      score: 0.55,
    });
  });
});

describe('lab-57 Custom scorer (DoD)', () => {
  it('scorer fixtures pass and the score exposes its rationale', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output).toMatchObject(lab57Definition.expectedOutput.example);
    expect(ScoreCardSchema.safeParse(output.scoreCard).success).toBe(true);
    const completeness = output.scoreCard.criteria.find((c) => c.id === 'completeness')!;
    expect(completeness.missing).toEqual(['then passes one step’s output to the next step']);
    expect(completeness.evidence[0]).toContain('“A Mastra workflow runs its steps in a fixed order.”');
    expect(output.scoreCard.reason).toBe(
      'Completeness 2/3 key points (missing: then passes one step’s output to the next step). Relevance 2/2 sentences on topic. No known-wrong claims. Length 20/120 words. Score = clamp(0.6 × 0.6667 + 0.4 × 1 − 0 − 0, 0, 1) = 0.8.',
    );
  });

  it('an empty answer is not scored', async () => {
    const { output, validation } = await run({ answer: '' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.scoreCard).toMatchObject({
      score: null,
      passed: null,
      notScorable: 'the answer has fewer than 3 words',
      criteria: [],
    });
  });

  it('scores an agent’s answer with the same scorer', async () => {
    const { output, validation } = await run({ answerSource: 'agent' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.agent?.toolCalls).toEqual(['search_sources']);
    expect(output.scoreCard.score).toBe(0.8);
  });

  it('flags a fixture that does not reproduce', async () => {
    const { output } = await run();
    const fx = output.scoreCard.fixtures.map((f, i) => (i === 1 ? { ...f, ok: false } : f));
    const v = lab57.validate!(
      { ...output, scoreCard: { ...output.scoreCard, fixtures: fx } },
      lab57Definition.exampleInput as never,
      {
        events: [],
        mode: 'offline',
      },
    ) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'scorer-fixtures-pass')?.passed).toBe(false);
  });
});
