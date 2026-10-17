import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { classifyOffline, lab28, summarizeOffline, type Lab28Output } from './run.js';
import { mergeTriage } from './triage.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab28]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-28', { input: { ...lab28.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  return runner.events(r.runId).find((e) => e.type === 'result') as { output: Lab28Output; validation: { passed: boolean } };
}

describe('lab-28 branch logic (unit)', () => {
  it('classifies, summarises and merges purely', () => {
    expect(classifyOffline('My package never arrived')).toEqual({ category: 'shipping', priority: 'low' });
    expect(summarizeOffline('Hello, the app crashes on start. Please help.')).toBe('Customer reports: the app crashes on start.');
    const joined = { classify: { category: 'technical' as const, priority: 'high' as const }, summarize: { summary: 's' } };
    expect(mergeTriage('T-1', joined)).toEqual(mergeTriage('T-1', { summarize: joined.summarize, classify: joined.classify }));
  });
});

describe('lab-28 parallel branches (DoD)', () => {
  it('both branches complete and join; parallelism is measured from step timestamps', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    const [c, s] = output.branches;
    expect(c!.startMs).toBeLessThan(s!.endMs);
    expect(s!.startMs).toBeLessThan(c!.endMs); // overlapping intervals
    expect(output.timing!.parallelSpanMs).toBeGreaterThanOrEqual(480); // ≈ the slower 500 ms branch
    expect(output.timing!.parallelSpanMs).toBeLessThan(output.timing!.sumOfBranchesMs);
    expect(output.latencySource).toContain('simulated');
  });

  it('the merge does not depend on completion order', async () => {
    const a = await run();
    const b = await run({ classifyLatencyMs: 500, summarizeLatencyMs: 300 });
    expect(a.output.completionOrder).toEqual(['classify', 'summarize']);
    expect(b.output.completionOrder).toEqual(['summarize', 'classify']);
    expect(b.output.merged).toEqual(a.output.merged);
  });
});
