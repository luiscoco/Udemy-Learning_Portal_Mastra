import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { bm25Scores, fuse, rank, recompute, tokenize, type Passage } from './hybrid.js';
import { lab42, type Lab42Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab42]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab42Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-42', { input: { ...lab42.definition.exampleInput, ...input } });
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

describe('lab-42 hybrid scoring (unit, deterministic)', () => {
  const passages: Passage[] = [
    { id: 'a', docId: 'd', source: 's', text: 'Error E-5003 means the warehouse could not reserve the item.' },
    { id: 'b', docId: 'd', source: 's', text: 'Error E-7001 means the address failed validation.' },
    { id: 'c', docId: 'd', source: 's', text: 'Refunds go back to the original payment method.' },
  ];
  it('keeps identifiers whole and drops stopwords', () => {
    expect(tokenize('What does error E-5003 mean?')).toEqual(['error', 'e-5003', 'mean']);
    expect(tokenize('Quote ORD-5521 in the reply')).toEqual(['quote', 'ord-5521', 'reply']);
  });
  it('BM25 prefers the passage with the rare term', () => {
    const s = bm25Scores(passages, 'error E-5003');
    expect(s.get('a')!.score).toBeGreaterThan(s.get('b')!.score);
    expect(s.get('a')!.matched).toEqual(['error', 'e-5003']);
    expect(s.get('c')!.score).toBe(0);
  });
  it('RRF values are pinned and explained', () => {
    const keyword = new Map([
      ['a', { id: 'a', score: 2, rank: 1, matched: ['e-5003'] }],
      ['b', { id: 'b', score: 1, rank: 2, matched: [] }],
    ]);
    const vector = rank(
      new Map([
        ['b', 0.9],
        ['a', 0.8],
        ['c', 0.1],
      ]),
      0.25,
    );
    const fused = fuse(keyword, vector, 'rrf', { k: 60, alpha: 0.5 });
    expect(fused.map((h) => [h.id, h.fused])).toEqual([
      ['a', 0.0325], // 1/61 + 1/62
      ['b', 0.0325], // 1/62 + 1/61: a tie, broken by id
    ]);
    expect(fused[0]!.explanation).toBe('rrf = 1/(60+1) + 1/(60+2) = 0.0325');
    for (const h of fused) expect(recompute(h, 'rrf', { k: 60, alpha: 0.5 })).toBe(h.fused);
    expect(fuse(keyword, vector, 'rrf', { k: 60, alpha: 0.5 })).toEqual(fused);
  });
  it('weighted blends normalised scores', () => {
    const keyword = new Map([['a', { id: 'a', score: 4, rank: 1, matched: [] }]]);
    const vector = rank(
      new Map([
        ['a', 0.5],
        ['b', 0.9],
      ]),
      0.25,
    );
    const [a, b] = fuse(keyword, vector, 'weighted', { k: 60, alpha: 0.5 }); // tie at 0.5, broken by id
    expect(a).toMatchObject({ id: 'a', fused: 0.5, normalized: { keyword: 1, vector: 0 } });
    expect(b).toMatchObject({ id: 'b', fused: 0.5, normalized: { keyword: 0, vector: 1 } });
    expect(recompute(a!, 'weighted', { k: 60, alpha: 0.5 })).toBe(0.5);
  });
});

describe('lab-42 hybrid search (DoD)', () => {
  it('hybrid explains its scores and fixes both single-method misses', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.accuracy).toMatchObject({
      'keyword-only': { correct: 3 },
      'vector-only': { correct: 4 },
      rrf: { correct: 5 },
      weighted: { correct: 5 },
    });
    const e5003 = output.results[0]!;
    expect(e5003.topByMethod).toMatchObject({ 'keyword-only': 'err-5003', 'vector-only': 'err-7001', rrf: 'err-5003' });
    expect(e5003.hits[0]!.keyword.matched).toContain('e-5003');
    expect(e5003.hits[0]!.explanation).toMatch(/^rrf = 1\/\(60\+1\) \+ 1\/\(60\+\d\) = /);
  });

  it('single methods fail where expected', async () => {
    expect(check((await run({ method: 'keyword-only' })).validation, 'hybrid-expected-top')).toBe(false);
    expect(check((await run({ method: 'vector-only' })).validation, 'hybrid-expected-top')).toBe(false);
  });
});
