import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab34, type Lab34Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab34]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab34') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab34.definition.exampleInput as Record<string, unknown>;
type Result = { output: Lab34Output; validation: { passed: boolean; checks: { id: string; passed: boolean; message?: string }[] } };

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-34', { input: { ...example, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-3)));
  return result;
}
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;
const ran = (o: Lab34Output, instance: string) => o.executions.filter((e) => e.instance === instance).map((e) => e.stepId);

describe('lab-34 long-running reliability (DoD)', () => {
  it('crash-recovery fixture: restart continues from the interrupted step and avoids duplicate charges', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.firstRun.status).toBe('crashed');
    expect(output.detection).toMatchObject({ status: 'running', runningSteps: ['charge-INV-3'], stateCharged: ['INV-1', 'INV-2'] });
    // Worker A: INV-2 retried twice after 503s (three executions), then INV-3 charged before the crash.
    expect(ran(output, 'A')).toEqual(['charge-INV-1', 'charge-INV-2', 'charge-INV-2', 'charge-INV-2', 'charge-INV-3']);
    // Worker B: the interrupted step runs again from its start, then the rest; earlier steps do not.
    expect(ran(output, 'B')).toEqual(['charge-INV-3', 'charge-INV-4']);
    expect(output.executions.find((e) => e.instance === 'B')!.chargedAtEntry).toEqual(['INV-1', 'INV-2']);
    expect(output.chargeCounts).toEqual({ 'INV-1': 1, 'INV-2': 1, 'INV-3': 1, 'INV-4': 1 });
    expect(output.restart).toMatchObject({ status: 'success', result: { chargedCount: 4, total: 257.75 } });
    expect(output.finalState?.total).toBe(257.75);
  });

  it('without an idempotency key the restart charges the interrupted invoice twice', async () => {
    const { output, validation } = await run({ idempotency: 'none' });
    expect(output.chargeCounts['INV-3']).toBe(2);
    expect(check(validation, 'no-duplicate-charges')).toBe(false);
    expect(check(validation, 'resumed-after-crash')).toBe(true); // the restart itself behaved correctly
  });

  it('retries honour the configured delay', async () => {
    const t0 = Date.now();
    await run({ crashAfter: 'none', retryDelayMs: 300 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600); // two retries of INV-2
  });

  it('rejects a crash point that is not an invoice', () => {
    expect(lab34.inputSchema.safeParse({ ...example, crashAfter: 'INV-9' }).success).toBe(false);
  });
});
