import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab12 } from './run.js';
import { fieldErrors, performSupportAction, SupportActionInputSchema, SupportActionOutputSchema } from './schema.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab12]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('support action schemas (unit)', () => {
  it.each([
    [{ action: 'refund', orderId: 'ORD-000001', amountCents: 1, reason: 'late' }, true],
    [{ action: 'refund', orderId: 'ORD-000001', amountCents: 50_000, reason: 'other' }, true],
    [{ action: 'refund', orderId: 'ORD-000001', amountCents: 50_001, reason: 'other' }, false],
    [{ action: 'refund', orderId: 'ORD-000001', amountCents: 10.5, reason: 'other' }, false],
    [{ action: 'refund', orderId: 'ORD-1', amountCents: 100, reason: 'late' }, false],
    [{ action: 'exchange', orderId: 'ORD-000001', sku: 'TSH-0042', size: 'XL' }, true],
    [{ action: 'exchange', orderId: 'ORD-000001', sku: 'tsh-42', size: 'XL' }, false],
    [{ action: 'exchange', orderId: 'ORD-000001', sku: 'TSH-0042', size: 'XXL' }, false],
    [{ orderId: 'ORD-000001' }, false],
  ])('%j valid=%s', (args, valid) => {
    expect(SupportActionInputSchema.safeParse(args).success).toBe(valid);
  });

  it('reports field-specific errors with paths', () => {
    expect(fieldErrors({ action: 'refund', orderId: 'x', amountCents: -1, reason: 'late' }).map((e) => e.path)).toEqual([
      'orderId',
      'amountCents',
    ]);
  });

  it('business logic returns schema-valid typed output', () => {
    const out = performSupportAction({ action: 'exchange', orderId: 'ORD-000123', sku: 'TSH-0042', size: 'M' });
    expect(SupportActionOutputSchema.safeParse(out).success).toBe(true);
  });
});

describe('lab-12 end to end', () => {
  it('invalid input never executes business logic and is reported per field', async () => {
    const r = runner.start('lab-12', { input: lab12.definition.exampleInput });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    const result = events.find((e) => e.type === 'result') as {
      output: { executeCalls: number };
      validation: { passed: boolean };
    };
    expect(result.output.executeCalls).toBe(0);
    expect(result.validation.passed).toBe(true);
    expect(events.find((e) => e.type === 'tool-finish')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('validation failed'),
    });
    expect(events.filter((e) => e.type === 'log' && e.level === 'warn').map((e) => (e.type === 'log' ? e.message : ''))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Invalid field orderId'),
        expect.stringContaining('Invalid field amountCents'),
      ]),
    );
  });
});
