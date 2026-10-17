import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { extractOffline, lab26, type Lab26Output } from './run.js';
import { priceOrder } from './workflow.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab26]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-26', { input: { ...lab26.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return { events, result: events.find((e) => e.type === 'result') as { output: Lab26Output; validation: { passed: boolean } } };
}

describe('lab-26 pricing and extraction (unit)', () => {
  it('extracts items and the discount code offline', () => {
    expect(extractOffline('Please send me 2 ceramic mugs and 3 caps. Code WELCOME10')).toEqual({
      items: [
        { sku: 'MUG-01', quantity: 2 },
        { sku: 'CAP-02', quantity: 3 },
      ],
      discountCode: 'WELCOME10',
    });
    expect(extractOffline('one T-shirt and a tote bag').items).toEqual([
      { sku: 'TSH-03', quantity: 1 },
      { sku: 'BAG-04', quantity: 1 },
    ]);
  });

  it('prices deterministically with fixed rates and known codes only', () => {
    expect(priceOrder({ items: [{ sku: 'MUG-01', quantity: 2 }], discountCode: 'NOPE' }, 'EUR')).toMatchObject({
      subtotal: 2500,
      discount: 0,
      discountCode: null,
    });
    expect(priceOrder({ items: [{ sku: 'CAP-02', quantity: 1 }], discountCode: 'welcome10' }, 'GBP')).toMatchObject({
      subtotal: 1290,
      discount: 129,
      total: 1161,
    });
  });
});

describe('lab-26 typed workflow (DoD)', () => {
  it('produces the expected typed output and an ordered lifecycle trace', async () => {
    const { result, events } = await run();
    expect(result.validation.passed).toBe(true);
    expect(result.output.quote).toMatchObject({ total: 6300, formattedTotal: '€63.00' });
    const trace = events
      .filter((e) => e.type === 'workflow-step')
      .map((e) => (e as { stepId: string; status: string }).stepId + ':' + (e as { status: string }).status);
    expect(trace).toEqual([
      'quote-workflow:running',
      'extract-and-price:running',
      'extract-and-price:success',
      'quote-workflow:success',
    ]);
    expect(result.output.inputProbe.message).toMatch(/Invalid input data/);
  });

  it('a buggy step is reported as success by Mastra but caught by the output check', async () => {
    const { result } = await run({ buggyStep: true });
    expect(result.output.status).toBe('success');
    expect(result.output.outputValid).toBe(false);
    expect(result.output.outputIssues[0]?.path).toBe('total');
  });
});
