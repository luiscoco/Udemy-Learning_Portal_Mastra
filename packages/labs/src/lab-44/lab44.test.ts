import { afterAll, describe, expect, it } from 'vitest';
import { CitedAnswerSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { guardClaims, locateQuote, type SourcePassage } from './claims.js';
import { lab44, type Lab44Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab44]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab44Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-44', { input: { ...lab44.definition.exampleInput, ...input } });
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

const src: SourcePassage = {
  id: 'refunds',
  title: 'handbook',
  location: 'handbook.md#refunds',
  text: 'Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method.',
};
const reply = (claims: object[]) => JSON.stringify({ claims });

describe('lab-44 claim guard (unit)', () => {
  it('locates quotes in the original text despite case and whitespace', () => {
    const span = locateQuote(src.text, 'request a  REFUND within 30 days')!;
    expect(span).toEqual({ start: 14, end: 45 });
    expect(src.text.slice(span.start, span.end)).toBe('request a refund within 30 days');
    expect(locateQuote(src.text, 'within 60 days')).toBeNull();
  });
  it.each([
    [{ text: 'Refunds within 30 days.', citations: [] }, 'UNCITED_CLAIM'],
    [{ text: 'Refunds within 30 days.', citations: [{ id: 'kb-1', quote: 'x' }] }, 'UNKNOWN_SOURCE'],
    [
      { text: 'Refunds within 30 days.', citations: [{ id: 'refunds', quote: 'a sentence that is not there' }] },
      'QUOTE_NOT_FOUND',
    ],
    [
      { text: 'Shipping is free.', citations: [{ id: 'refunds', quote: 'Refunds go back to the original payment method.' }] },
      'UNSUPPORTED_CLAIM',
    ],
    [
      {
        text: 'Refunds within 60 days of delivery.',
        citations: [{ id: 'refunds', quote: 'Customers can request a refund within 30 days of delivery.' }],
      },
      'UNGROUNDED_NUMBER',
    ],
  ])('%# blocks %s', (claim, code) => {
    const g = guardClaims(reply([claim]), [src], { enforce: true });
    expect(g.verdicts[0]!.reasons.map((r) => r.code)).toContain(code);
    expect(g.citedAnswer.claims).toEqual([]);
    expect(g.citedAnswer.blocked).toHaveLength(1);
    expect(g.citedAnswer.fallback).toBe(true);
  });
  it('keeps valid claims when another is blocked, with exact quote offsets', () => {
    const g = guardClaims(
      reply([
        {
          text: 'You can request a refund within 30 days.',
          citations: [{ id: 'refunds', quote: 'Customers can request a refund within 30 days of delivery.' }],
        },
        { text: 'Students get 20% off.', citations: [{ id: 'kb-9', quote: 'Students get 20% off.' }] },
      ]),
      [src],
      { enforce: true },
    );
    expect(g.citedAnswer.claims).toHaveLength(1);
    const c = g.citedAnswer.claims[0]!.citations[0]!;
    expect(src.text.slice(c.quoteStart, c.quoteEnd)).toBe(c.quote);
    expect(CitedAnswerSchema.safeParse(g.citedAnswer).success).toBe(true);
  });
});

describe('lab-44 citation-aware generation (DoD)', () => {
  it('claims cite their own sources; every citation opens at its quote', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.citedAnswer.claims.map((c) => c.citations[0]!.sourceId)).toEqual(['err-4012', 'refunds']);
    for (const c of output.citedAnswer.claims)
      for (const cit of c.citations)
        expect(output.citedAnswer.sources[cit.sourceId]!.text.slice(cit.quoteStart, cit.quoteEnd)).toBe(cit.quote);
    expect(output.results[3]!.citedAnswer).toMatchObject({ claims: [], fallback: true });
    expect(CitedAnswerSchema.safeParse(output.citedAnswer).success).toBe(true);
  });

  it('a sloppy model’s unmatched citations are blocked; valid claims survive', async () => {
    const { output, validation } = await run({ offlineBehaviour: 'sloppy' });
    expect(validation.passed).toBe(true);
    const first = output.results[0]!.citedAnswer;
    expect(first.claims).toHaveLength(2);
    expect(first.blocked.map((b) => b.reasons[0]!.split(':')[0])).toEqual([
      'UNKNOWN_SOURCE',
      'QUOTE_NOT_FOUND',
      'UNGROUNDED_NUMBER',
    ]);
  });

  it('guard off: unmatched citations are shown and the checks fail', async () => {
    const { validation } = await run({ offlineBehaviour: 'sloppy', guard: 'off' });
    expect(check(validation, 'unmatched-citations-blocked')).toBe(false);
    expect(check(validation, 'sources-openable')).toBe(false);
  });
});
