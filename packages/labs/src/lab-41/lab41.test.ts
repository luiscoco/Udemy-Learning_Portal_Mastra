import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { buildFilter, dateNumber, leaksOf, validateLearnerFilter } from './filters.js';
import { lab41, modelChosenFilter as modelChosenFilterFor, type Lab41Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab41]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab41') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab41Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-41', { input: { ...lab41.definition.exampleInput, ...input } });
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

describe('lab-41 filters (unit)', () => {
  it('builds the server filter with the tenant first', () => {
    const f = buildFilter({ tenant: 'acme', role: 'customer', asOf: 20260601, learner: { tags: { $in: ['shipping'] } } }) as {
      $and: unknown[];
    };
    expect(f.$and[0]).toEqual({ tenantId: { $eq: 'acme' } });
    expect(f.$and[1]).toEqual({ visibility: { $in: ['public'] } });
    expect(f.$and).toHaveLength(5);
    expect(dateNumber('2025-06-01')).toBe(20250601);
  });
  it('rejects filters that could widen the tenant scope', () => {
    expect(validateLearnerFilter({ tags: { $in: ['policy'] } })).toEqual([]);
    expect(validateLearnerFilter({ $and: [{ effectiveFrom: { $gte: 20250101 } }] })).toEqual([]);
    expect(validateLearnerFilter({ tenantId: 'globex' })[0]).toMatch(/session/);
    expect(validateLearnerFilter({ $or: [{ tags: 'x' }] })[0]).toMatch(/widen/);
    expect(validateLearnerFilter({ tags: { $regex: 'a' } })[0]).toMatch(/unsupported operator/);
    expect(validateLearnerFilter({ visibility: { $in: ['internal'] } })[0]).toMatch(/field not allowed/);
    expect(validateLearnerFilter({ $and: [{ tenantId: 'x' }] })[0]).toMatch(/session/);
  });
  it('finds leaks and simulates a model-chosen filter', () => {
    expect(
      leaksOf(
        [
          { tenantId: 'acme', docId: 'a' },
          { tenantId: 'globex', docId: 'g' },
        ],
        'acme',
      ),
    ).toEqual(['g']);
    expect(modelChosenFilterFor('What is the Globex policy?', 'acme')).toBe('{"tenantId":"globex"}');
  });
});

describe('lab-41 metadata filters (DoD)', () => {
  it('filter fixtures pass and cross-tenant retrieval is impossible with the server filter', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.outcomes.flatMap((o) => o.leaks)).toEqual([]);
    const top = output.outcomes.map((o) => o.hits[0]?.docId ?? o.status);
    expect(top).toEqual([
      'acme-refunds-2026',
      'acme-refunds-2025',
      'globex-refunds',
      'acme-refunds-2026',
      'acme-internal-goodwill',
      'acme-refunds-2026',
      'acme-shipping',
      'rejected',
    ]);
    expect(output.outcomes[0]!.answer!.text).toBe('Customers can request a refund within 30 days of delivery.');
    expect(output.outcomes[3]!.hits.every((h) => h.tenantId === 'acme')).toBe(true); // the Globex question, asked by Acme
    expect(output.outcomes[5]!.hits.some((h) => h.visibility === 'internal')).toBe(false); // customers never see internal notes
  });

  it('a model-chosen filter leaks the other tenant', async () => {
    const { output, validation } = await run({ tenantScoping: 'model-filter' });
    expect(output.outcomes[3]!.leaks).toEqual(expect.arrayContaining(['globex-refunds']));
    expect(check(validation, 'no-cross-tenant-results')).toBe(false);
  });

  it('a plain value on an array field matches nothing (silent failure)', async () => {
    const { output } = await run({
      cases: [
        {
          tenant: 'acme',
          role: 'customer',
          question: 'When does my order arrive?',
          asOf: '2026-06-01',
          filter: { tags: 'shipping' },
        },
      ],
    });
    expect(output.outcomes[0]!.status).toBe('no-results');
  });
});
