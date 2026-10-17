import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { aggregateResults, type ItemResult } from './batch.js';
import { lab30, summarizeOffline, type Lab30Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab30]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab30.definition.exampleInput as { documents: Record<string, unknown>[] };

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-30', { input: { ...example, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return {
    events,
    result: events.find((e) => e.type === 'result') as {
      output: Lab30Output;
      validation: { passed: boolean; checks: { id: string; passed: boolean }[] };
    },
  };
}

describe('lab-30 aggregation (unit)', () => {
  const ok = (docId: string, keywords: string[]): ItemResult => ({ ok: true, docId, title: docId, wordCount: 10, summary: 's', keywords });
  const bad = (docId: string): ItemResult => ({ ok: false, docId, title: docId, error: { code: 'EMPTY_DOCUMENT', message: 'm' } });
  it('reports empty, complete, partial and all-failed', () => {
    expect(aggregateResults([]).status).toBe('empty');
    expect(aggregateResults([ok('D-1', [])]).status).toBe('complete');
    expect(aggregateResults([ok('D-1', []), bad('D-2')])).toMatchObject({ status: 'partial', succeeded: 1, failed: 1, totalWords: 10 });
    expect(aggregateResults([bad('D-1')]).status).toBe('all-failed');
  });
  it('ranks keywords by document frequency, ties by name', () => {
    expect(aggregateResults([ok('D-1', ['refund', 'Days']), ok('D-2', ['days', 'ship'])]).topKeywords).toEqual(['days', 'refund', 'ship']);
  });
  it('offline summary is the first sentence', () => {
    expect(summarizeOffline('Title: X\n\nRefunds take five days. More text here.').summary).toBe('Refunds take five days.');
  });
  it('rejects duplicate docIds and oversized batches', () => {
    const d = { docId: 'D-1', title: 't', text: 'x' };
    expect(lab30.inputSchema.safeParse({ ...example, documents: [d, d] }).success).toBe(false);
    expect(lab30.inputSchema.safeParse({ ...example, documents: Array.from({ length: 13 }, (_, i) => ({ ...d, docId: `D-${i}` })) }).success).toBe(false);
  });
});

describe('lab-30 foreach processing (DoD)', () => {
  it('many documents: input order kept, concurrency bounded, partial failure represented', async () => {
    const { result, events } = await run();
    expect(result.validation.passed).toBe(true);
    const { report, peakInFlight } = result.output;
    expect(report!.results.map((r) => r.docId)).toEqual(['D-1', 'D-2', 'D-3', 'D-4', 'D-5']);
    expect(report!.status).toBe('partial');
    expect(report!.results[2]).toMatchObject({ ok: false, error: { code: 'EMPTY_DOCUMENT' } });
    expect(peakInFlight).toBe(2);
    expect(events.filter((e) => e.type === 'workflow-step' && /^processDocument\[\d\]$/.test(String(e.stepId)))).toHaveLength(5);
  });

  it('concurrency 1 is sequential; 4 is faster', async () => {
    const seq = await run({ concurrency: 1 });
    const par = await run({ concurrency: 4 });
    expect(seq.result.output.peakInFlight).toBe(1);
    expect(par.result.output.peakInFlight).toBe(4);
    expect(par.result.output.iterations.at(-1)!.atMs).toBeLessThan(seq.result.output.iterations.at(-1)!.atMs);
  });

  it('zero and one documents', async () => {
    const zero = await run({ documents: [] });
    expect(zero.result.validation.passed).toBe(true);
    expect(zero.result.output.report).toMatchObject({ status: 'empty', total: 0, results: [] });
    const one = await run({ documents: [example.documents[0]] });
    expect(one.result.output.report).toMatchObject({ status: 'complete', total: 1, succeeded: 1 });
  });

  it('a flagged document fails with PROCESSING_FAILED, the rest are kept', async () => {
    const documents = example.documents.map((d) => (d.docId === 'D-5' ? { ...d, simulateFailure: true } : d));
    const { result } = await run({ documents });
    expect(result.output.report).toMatchObject({ status: 'partial', succeeded: 3, failed: 2 });
    expect(result.output.report!.results[4]).toMatchObject({ ok: false, error: { code: 'PROCESSING_FAILED' } });
  });

  it('throw mode loses the whole batch', async () => {
    const { result } = await run({ failureHandling: 'throw' });
    expect(result.output).toMatchObject({ workflowStatus: 'failed', aggregateRan: false, report: null });
    expect(result.validation.checks.find((c) => c.id === 'partial-failures-kept')?.passed).toBe(false);
  });
});
