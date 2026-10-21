import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab62Definition } from './definition.js';
import { Lab62InputSchema, lab62, type Lab62Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab62]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-62') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-62', { input });
  expect((await runner.waitFor(r.runId)).status).toBe('succeeded');
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  return { events, result: result?.type === 'result' ? result : undefined };
}

describe('Lab 62', () => {
  it('shows the shared-store leak and passes every isolation check', async () => {
    const { events, result } = await run(lab62Definition.exampleInput);
    expect(result?.validation?.passed).toBe(true);
    const out = result!.output as Lab62Output;
    expect(out.shared.bSawThreads.map((t) => t.title)).toContain('alice: My exam retake is on Friday.');
    expect(out.partitioned.bSawThreads).toEqual([]);
    expect(out.hostile.parentFolder).toBe('tenants');
    expect(JSON.stringify(out)).not.toContain('etc/passwd/');
    expect(events.filter((e) => e.type === 'workflow-step')).toHaveLength(8);
  });

  it('is repeatable: a rerun does not accumulate threads in B’s partition', async () => {
    const { result } = await run({ ...lab62Definition.exampleInput, note: 'Second invented note' });
    expect(result?.validation?.passed).toBe(true);
    expect((result!.output as Lab62Output).shared.bSawThreads).toHaveLength(1);
  });

  it('rejects identical demo learners and invalid names', () => {
    const base = lab62Definition.exampleInput;
    expect(Lab62InputSchema.safeParse({ ...base, learnerB: 'ALICE' }).success).toBe(false);
    expect(Lab62InputSchema.safeParse({ ...base, learnerA: '../x' }).success).toBe(false);
  });
});
