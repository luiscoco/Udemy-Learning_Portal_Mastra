import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab11 } from './run.js';
import { calculateOrderTotal } from './tool.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab11]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('calculateOrderTotal (pure)', () => {
  it.each([
    [
      {
        items: [
          { name: 'a', unitPriceCents: 450, quantity: 3 },
          { name: 'b', unitPriceCents: 125, quantity: 4 },
        ],
        discountPct: 10,
        taxRatePct: 8,
      },
      1798,
    ],
    [{ items: [{ name: 'a', unitPriceCents: 100, quantity: 1 }], discountPct: 0, taxRatePct: 0 }, 100],
    [{ items: [{ name: 'a', unitPriceCents: 999, quantity: 1 }], discountPct: 100, taxRatePct: 20 }, 0],
    [{ items: [{ name: 'a', unitPriceCents: 333, quantity: 3 }], discountPct: 0, taxRatePct: 7.5 }, 1074],
  ])('%j → %i cents', (input, total) => {
    expect(calculateOrderTotal(input).totalCents).toBe(total);
  });
});

describe('lab-11 agent + tool', () => {
  it('shows tool input/output in the event timeline and validates totals', async () => {
    const r = runner.start('lab-11', { input: lab11.definition.exampleInput });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    const start = events.find((e) => e.type === 'tool-start');
    const finish = events.find((e) => e.type === 'tool-finish');
    expect(start).toMatchObject({ toolName: 'calculateOrderTotal', args: { discountPct: 10, taxRatePct: 8 } });
    expect(finish).toMatchObject({ toolName: 'calculateOrderTotal', status: 'success', result: { totalCents: 1798 } });
    expect(start!.seq).toBeLessThan(finish!.seq);
    expect(events.find((e) => e.type === 'result')).toMatchObject({ validation: { passed: true } });
  });
});
