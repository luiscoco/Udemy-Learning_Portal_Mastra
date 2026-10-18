import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { FALLBACK, guardAnswer, numbersIn, parseAnswer, type RetrievedChunk } from './guard.js';
import { lab40, type Lab40Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab40]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab40Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-40', { input: { ...lab40.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result)
    throw new Error(
      JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log' || e.type === 'error').slice(-3)),
    );
  return { ...result, events };
}
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;

const chunk: RetrievedChunk = {
  id: 'c1',
  docId: 'd',
  source: 'd.md',
  start: 0,
  end: 60,
  text: 'Customers can request a refund within 30 days of delivery.',
  score: 0.7,
};
const answer = (o: object) => JSON.stringify({ answer: 'x', supported: true, citations: [], ...o });

describe('lab-40 citation guard (unit): one case per rule', () => {
  it('accepts a grounded answer', () => {
    const g = guardAnswer(
      answer({ answer: 'Refunds within 30 days.', citations: [{ chunkId: 'c1', quote: 'request a refund  within 30 days' }] }),
      [chunk],
      0.25,
    );
    expect(g.verdict).toBe('accepted');
    expect(g.shown.citations[0]!.chunk.source).toBe('d.md');
  });
  it.each([
    ['not json at all', 'UNPARSEABLE'],
    [answer({ citations: [] }), 'NO_CITATION'],
    [answer({ citations: [{ chunkId: 'c9', quote: 'anything' }] }), 'UNKNOWN_CHUNK'],
    [answer({ citations: [{ chunkId: 'c1', quote: 'within 60 days' }] }), 'QUOTE_NOT_FOUND'],
    [answer({ answer: 'Refunds within 45 days.', citations: [{ chunkId: 'c1', quote: 'within 30 days' }] }), 'UNGROUNDED_NUMBER'],
    [
      JSON.stringify({ answer: 'No.', supported: false, citations: [{ chunkId: 'c1', quote: 'within 30 days' }] }),
      'CITED_BUT_UNSUPPORTED',
    ],
  ])('%s → %s', (raw, code) => {
    const g = guardAnswer(raw, [chunk], 0.25);
    expect(g.verdict).toBe('blocked');
    expect(g.reasons.map((r) => r.code)).toContain(code);
    expect(g.shown).toEqual({ answer: FALLBACK, supported: false, citations: [] });
  });
  it('weak support is blocked; an honest refusal is accepted', () => {
    expect(
      guardAnswer(answer({ citations: [{ chunkId: 'c1', quote: 'within 30 days' }] }), [{ ...chunk, score: 0.1 }], 0.25)
        .reasons[0]!.code,
    ).toBe('WEAK_SUPPORT');
    expect(
      guardAnswer(JSON.stringify({ answer: "The documents don't say.", supported: false, citations: [] }), [], 0.25).verdict,
    ).toBe('accepted');
  });
  it('parses fenced JSON and finds numbers', () => {
    expect(parseAnswer('```json\n{"answer":"a","supported":false,"citations":[]}\n```')?.answer).toBe('a');
    expect(numbersIn('within 30 days, 4.5 stars, 500 euros')).toEqual(['30', '4.5', '500']);
  });
});

describe('lab-40 RAG question-answering agent (DoD)', () => {
  it('citations map to source chunks; the unsupported question is handled honestly', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed).toBe(true);
    const [refund, express, transcripts, discount] = output.outcomes;
    expect(refund!.shown).toMatchObject({
      supported: true,
      answer: 'Customers can request a refund within 30 days of delivery.',
    });
    expect(refund!.shown.citations[0]).toMatchObject({ docId: 'support-handbook', source: 'support-handbook.md', start: 0 });
    expect(express!.shown.answer).toContain('next business day');
    expect(transcripts!.shown.citations[0]!.docId).toBe('privacy-policy');
    expect(discount!.shown).toEqual({ answer: "The documents don't say.", supported: false, citations: [] });
    // The agent really used Mastra's vector query tool.
    expect(events.filter((e) => e.type === 'tool-start' && (e as { toolName?: string }).toolName === 'searchDocs')).toHaveLength(
      4,
    );
  });

  it('overconfident model: the guard blocks the invented discount with reasons', async () => {
    const { output, validation } = await run({ offlineBehaviour: 'overconfident' });
    const d = output.outcomes[3]!;
    expect(d.modelClaimedSupported).toBe(true);
    expect(d.guard!.verdict).toBe('blocked');
    expect(d.guard!.reasons.map((r) => r.code)).toEqual(
      ['UNKNOWN_CHUNK', 'NO_CITATION', 'UNGROUNDED_NUMBER'].filter((c) => d.guard!.reasons.some((r) => r.code === c)),
    );
    expect(d.guard!.reasons.map((r) => r.code)).toContain('UNKNOWN_CHUNK');
    expect(d.shown.answer).toBe(FALLBACK);
    expect(validation.passed).toBe(true);
  });

  it('guard off: the invented answer is shown and the checks fail', async () => {
    const { output, validation } = await run({ offlineBehaviour: 'overconfident', guard: 'off' });
    expect(output.outcomes[3]!.shown.answer).toContain('15% discount');
    expect(check(validation, 'citations-map-to-chunks')).toBe(false);
    expect(check(validation, 'unsupported-handled')).toBe(false);
  });
});
