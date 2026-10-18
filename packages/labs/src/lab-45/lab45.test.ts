import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { aggregate, scoreItem, summaryLine } from './metrics.js';
import { lab45, type Lab45Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab45]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab45Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-45', { input: { ...lab45.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result)
    throw new Error(
      JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log' || e.type === 'error').slice(-3)),
    );
  return result;
}
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;

describe('lab-45 scorers (unit, deterministic)', () => {
  const input = { itemId: 'x', question: 'q' };
  it('scores one item and explains each metric', async () => {
    const s = await scoreItem(
      input,
      {
        retrieved: ['a', 'b'],
        verdicts: [
          { text: 'c1', accepted: true },
          { text: 'c2', accepted: false },
        ],
        shownClaims: 1,
      },
      { relevant: ['a'], answerable: true },
    );
    expect(s['retrieval-hit-rate']).toEqual({ score: 1, reason: 'hit: retrieved a' });
    expect(s['context-relevance']).toEqual({ score: 0.5, reason: '1 of 2 retrieved passage(s) are relevant' });
    expect(s['answer-faithfulness']).toEqual({ score: 0.5, reason: '1 of 2 claim(s) verified' });
    expect(s.abstention).toEqual({ notScorable: 'the item is answerable' });
    expect(s['answer-rate']).toEqual({ score: 1, reason: 'answered with 1 verified claim(s)' });
  });
  it('marks metrics that do not apply as not scorable', async () => {
    const s = await scoreItem(input, { retrieved: [], verdicts: [], shownClaims: 0 }, { relevant: [], answerable: false });
    expect(s['retrieval-hit-rate']).toEqual({ notScorable: 'no relevant passage exists for this item' });
    expect(s['context-relevance']).toEqual({ notScorable: 'nothing was retrieved' });
    expect(s['answer-faithfulness']).toEqual({ notScorable: 'the model made no claims' });
    expect(s.abstention).toEqual({ score: 1, reason: 'abstained: no claims shown' });
  });
  it('aggregates with n and builds a verifiable summary line', () => {
    const a = aggregate([{ score: 1, reason: '' }, { score: 0, reason: '' }, { notScorable: 'x' }]);
    expect(a).toEqual({ mean: 0.5, sum: 1, n: 2, notScorable: 1 });
    expect(summaryLine('retrieval-hit-rate', a, 0.8)).toBe(
      'retrieval-hit-rate: 1/2 = 0.50 (n = 2, not scorable = 1), gate ≥ 0.8: FAIL',
    );
    expect(summaryLine('abstention', aggregate([{ notScorable: 'x' }]), 1)).toContain('not applicable');
  });
});

describe('lab-45 RAG quality evaluation (DoD)', () => {
  it('metrics are reproducible, sample inputs visible, and the summary is verifiable', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.reproducibility).toMatchObject({ rescoreIdentical: true, rerunIdentical: true });
    expect(output.aggregates['retrieval-hit-rate']).toEqual({ mean: 1, sum: 6, n: 6, notScorable: 2 });
    expect(output.aggregates['answer-rate']).toMatchObject({ sum: 4, n: 6 });
    expect(output.items).toHaveLength(8);
    expect(output.items[1]).toMatchObject({ id: 'money-back', retrieved: expect.arrayContaining(['refunds']), shownClaims: 0 });
    const again = await run();
    expect(again.output.aggregates).toEqual(output.aggregates);
  });

  it('weaker retrieval and an unfaithful generator fail their gates', async () => {
    const kw = await run({ retrieval: 'keyword-only' });
    expect(kw.output.gates['retrieval-hit-rate']).toMatchObject({ pass: false });
    expect(check(kw.validation, 'gates-met')).toBe(false);
    const sloppy = await run({ offlineBehaviour: 'sloppy' });
    expect(sloppy.output.gates['answer-faithfulness'].mean).toBeLessThan(0.9);
    expect(check(sloppy.validation, 'summary-verifiable')).toBe(true);
  });

  it('rejects inconsistent ground truth', () => {
    const bad = {
      ...lab45.definition.exampleInput,
      dataset: [{ id: 'x', question: 'Question?', relevant: [], answerable: true }],
    };
    expect(lab45.inputSchema.safeParse(bad).success).toBe(false);
  });
});
