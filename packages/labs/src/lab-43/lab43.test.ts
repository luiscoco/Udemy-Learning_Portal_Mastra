import { afterAll, describe, expect, it } from 'vitest';
import { rerankWithScorer } from '@mastra/rag';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab43, type Lab43Output } from './run.js';
import { keywordRelevance, keywordScorer, SafeScorer, validateWeights } from './scorers.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab43]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab43Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-43', { input: { ...lab43.definition.exampleInput, ...input } });
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

describe('lab-43 scorers (unit, deterministic)', () => {
  it('keyword relevance is the share of query terms in the text', () => {
    expect(keywordRelevance('What does error E-5003 mean?', 'Error E-5003: the warehouse could not reserve the item.')).toBe(
      0.6667,
    );
    expect(keywordRelevance('What does error E-5003 mean?', 'Error E-7001: the address failed.')).toBe(0.3333);
  });
  it('the safe wrapper neutralises thrown errors, NaN and out-of-range replies', async () => {
    const throwing = new SafeScorer({
      getRelevanceScore: async () => Promise.reject(new Error('Invalid relevance score returned by model: Relevance: 1')),
    });
    expect(await throwing.getRelevanceScore('q', 't')).toBe(0);
    expect(throwing.calls[0]).toMatchObject({ flag: 'SCORER_ERROR', used: 0 });
    const nan = new SafeScorer({ getRelevanceScore: async () => parseFloat('Relevance: 0.9') });
    expect(await nan.getRelevanceScore('q', 't')).toBe(0);
    expect(nan.calls[0]!.flag).toBe('NOT_A_NUMBER');
    const big = new SafeScorer({ getRelevanceScore: async () => 7 });
    expect(await big.getRelevanceScore('q', 't')).toBe(0);
    expect(big.calls[0]!.flag).toBe('OUT_OF_RANGE');
  });
  it('Mastra reranking is stable and pinned with the deterministic scorer', async () => {
    const results = [
      { id: 'err-7001', score: 0.6, metadata: { text: 'Error E-7001: the address failed.' } },
      { id: 'err-5003', score: 0.55, metadata: { text: 'Error E-5003: the warehouse could not reserve the item.' } },
    ];
    const opts = { results, query: 'What does error E-5003 mean?', scorer: keywordScorer, options: { topK: 2 } };
    const a = await rerankWithScorer(opts);
    const b = await rerankWithScorer(opts);
    expect(a.map((r) => r.result.id)).toEqual(['err-5003', 'err-7001']);
    expect(b).toEqual(a);
    // 0.4 × 0.6667 + 0.4 × 0.55 + 0.2 × (1 − 1/2) = 0.58667
    expect(a[0]!.score).toBeCloseTo(0.58667, 4);
  });
  it('a candidate without metadata.text gets no semantic score (verified trap)', async () => {
    const [r] = await rerankWithScorer({
      results: [{ id: 'x', score: 0.9, metadata: { body: 'E-5003' } }],
      query: 'E-5003',
      scorer: keywordScorer,
      options: {},
    });
    expect(r!.details.semantic).toBe(0);
  });
  it('weights must add up to 1', () => {
    expect(validateWeights({ semantic: 0.4, vector: 0.4, position: 0.2 })).toBeNull();
    expect(validateWeights({ semantic: 0.5, vector: 0.5, position: 0.5 })).toMatch(/add up to 1/);
  });
});

describe('lab-43 reranking (DoD)', () => {
  it('reranking fixes the first-stage miss; ranks are stable and provenance retained', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    const e = output.results[0]!;
    expect(e.before.slice(0, 2)).toEqual(['err-7001', 'err-5003']);
    expect(e.after[0]).toBe('err-5003');
    const winner = e.rows[0]!;
    expect(winner).toMatchObject({
      id: 'err-5003',
      firstStageRank: 2,
      rerankedRank: 1,
      movement: 1,
      provenanceIntact: true,
      source: 'error-codes.md#e-5003',
    });
    expect(winner.components!.semantic).toBeGreaterThan(e.rows[1]!.components!.semantic);
  });

  it('no reranker keeps the first-stage miss', async () => {
    const { output, validation } = await run({ scorer: 'none' });
    expect(output.results[0]!.after[0]).toBe('err-7001');
    expect(check(validation, 'expected-top-after-rerank')).toBe(false);
  });

  it('chatty scorer replies are flagged and the run still completes, without NaN', async () => {
    const { output, validation } = await run({ chattyScorer: true });
    const calls = output.results.flatMap((r) => r.scorerCalls);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.flag === 'SCORER_ERROR')).toBe(true);
    expect(check(validation, 'scorer-output-validated')).toBe(true);
    expect(check(validation, 'expected-top-after-rerank')).toBe(false); // the semantic signal is lost
  });

  it('rejects weights that do not add up to 1', () => {
    expect(lab43.inputSchema.safeParse({ ...lab43.definition.exampleInput, weightPosition: 0.5 }).success).toBe(false);
  });
});
