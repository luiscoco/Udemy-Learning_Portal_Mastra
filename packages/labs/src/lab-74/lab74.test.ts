import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { GATE_NAMES } from './gates.js';
import { lab74Definition } from './definition.js';
import { Lab74InputSchema, lab74, loadRecorded, type Lab74Output } from './run.js';

const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-74') });
const runner = new LabRunner({ registry: new LabRegistry([lab74]), services, liveEnabled: false });
afterAll(() => runner.dispose());
const base = lab74Definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-74', { input: { ...base, ...input } });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  const res = result?.type === 'result' ? result : undefined;
  return { snap, events, res, out: res?.output as Lab74Output };
}

describe('recorded evidence', () => {
  it('comes from a complete, passing regression run and carries no secrets', () => {
    const rec = loadRecorded();
    expect(rec.commit).toMatch(/^[0-9a-f]{12}$/);
    expect(rec.measurements.a11y.length).toBeGreaterThanOrEqual(148);
    expect(rec.measurements.load.healthMs).toHaveLength(300);
    expect(rec.measurements.recovery.every((t) => t.status === 'passed')).toBe(true);
    expect(JSON.stringify(rec)).not.toMatch(/mlp_session=|scrypt\$|sk-[A-Za-z0-9]{16}/);
  });
});

describe('Lab 74', () => {
  it('the example: the injected eval regression fails only its gate, the fresh measurement matches', async () => {
    const { snap, res, out, events } = await run({});
    expect(snap.status).toBe('succeeded');
    expect(res?.validation?.passed, JSON.stringify(res?.validation)).toBe(true);
    expect(out.gates.filter((g) => g.status === 'fail').map((g) => g.gate)).toEqual(['eval-regression']);
    expect(out.gates.find((g) => g.gate === 'eval-regression')!.findings[0]).toMatch(/golden fixture ".+" regressed/);
    expect(out.withoutInjection.every((g) => g.status === 'pass')).toBe(true);
    const steps = events.flatMap((e) =>
      e.type === 'workflow-step' && e.status !== 'running' ? [`${e.stepId}:${e.status}`] : [],
    );
    expect(steps.slice(0, 2)).toEqual(['load-evidence:success', 'measure-fresh:success']);
    expect(steps).toContain('eval-regression:failed');
  });

  it.each(GATE_NAMES)('injecting %s fails exactly that gate', async (gate) => {
    const { res, out } = await run({ inject: gate, measureFresh: false });
    expect(out.gates.filter((g) => g.status === 'fail').map((g) => g.gate)).toEqual([gate]);
    expect(res?.validation?.passed).toBe(true);
  });

  it('a stricter threshold fails the gate on the same recorded data', async () => {
    const rec = loadRecorded();
    const sorted = [...rec.measurements.load.healthMs].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
    const { out } = await run({ inject: 'none', measureFresh: false, healthP95Ms: Math.max(10, p95 - 1) });
    if (p95 - 1 >= 10) expect(out.gates.find((g) => g.gate === 'load-smoke')!.status).toBe('fail');
    const loose = await run({ inject: 'none', measureFresh: false, healthP95Ms: 1_000 });
    expect(loose.out.gates.every((g) => g.status === 'pass')).toBe(true);
  });

  it('validates inputs', () => {
    expect(Lab74InputSchema.safeParse({ ...base, inject: 'bundle-size' }).success).toBe(false);
    expect(Lab74InputSchema.safeParse({ ...base, healthP95Ms: 5 }).success).toBe(false);
  });
});
