import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab38 } from '../lab-38/run.js';
import { keywordsOf, meetsExpectation, snippetFor } from './retrieve.js';
import { lab39, type Lab39Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab38, lab39]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab39') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab39Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(labId: string, input: Record<string, unknown>) {
  const r = runner.start(labId, { input });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result)
    throw new Error(
      JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log' || e.type === 'error').slice(-3)),
    );
  return result;
}
const example = lab39.definition.exampleInput as Record<string, unknown>;
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;

describe('lab-39 retrieval helpers (unit)', () => {
  it('extracts keywords and windows a snippet with absolute offsets', () => {
    expect(keywordsOf('How long do I have to ask for my money back?')).toEqual(['long', 'money', 'back']);
    const text = 'Intro words here. Customers can request a refund within 30 days of delivery.';
    const s = snippetFor(text, 100, ['refund']);
    expect(s.snippet).toContain('refund within 30 days');
    expect(text.slice(s.start - 100, s.end - 100)).toBe(s.snippet);
    expect(s.matched).toEqual(['refund']);
  });
  it('evaluates expectations on the rank-1 hit only', () => {
    const hits = [
      { docId: 'a', text: 'other' },
      { docId: 'b', text: 'within 30 days' },
    ];
    expect(meetsExpectation({ docId: 'b', contains: '30 days' }, hits)).toBe(false);
    expect(meetsExpectation({ docId: 'a', contains: 'OTHER' }, hits)).toBe(true);
    expect(meetsExpectation('none', [])).toBe(true);
    expect(meetsExpectation(undefined, hits)).toBeNull();
  });
});

describe('lab-39 vector retrieval (DoD)', () => {
  it('known fixtures are retrieved in the expected order, with traceable snippets', async () => {
    const { output, validation } = await run('lab-39', example);
    expect(validation.passed).toBe(true);
    expect(output.results.map((r) => r.expectationMet)).toEqual([true, true, true, true, true, true]);
    for (const r of output.results) for (const h of r.hits) expect(h.traceable).toBe(true);
    expect(output.results[5]).toMatchObject({ status: 'no-relevant-results', hits: [] });
  });

  it('heading-only chunks win with small recursive chunks', async () => {
    const { output, validation } = await run('lab-39', { ...example, chunking: 'recursive-200' });
    expect(output.results[0]!.hits[0]!.snippet.trim()).toBe('## Refunds');
    expect(check(validation, 'expected-order')).toBe(false);
  });

  it('an empty index is handled explicitly', async () => {
    const { output, validation } = await run('lab-39', { ...example, indexSource: 'empty' });
    expect(output.results.every((r) => r.status === 'empty-index' && r.hits.length === 0)).toBe(true);
    expect(validation.passed).toBe(true);
    expect(validation.checks.map((c) => c.id)).not.toContain('expected-order');
  });

  it('searches the persistent lab 38 index once it exists', async () => {
    const before = await run('lab-39', { ...example, indexSource: 'lab-38', questions: [{ question: 'refund rules?' }] });
    expect(before.output.results[0]!.status).toBe('empty-index');
    await run('lab-38', lab38.definition.exampleInput as Record<string, unknown>);
    const after = await run('lab-39', {
      ...example,
      indexSource: 'lab-38',
      questions: [{ question: 'How many days do I have to request a refund?' }],
    });
    expect(after.output.index.records).toBeGreaterThan(0);
    expect(after.output.results[0]!.hits.length).toBeGreaterThan(0);
    expect(after.validation.passed).toBe(true);
  });
});
