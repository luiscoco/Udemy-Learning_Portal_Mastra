import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { assessOffline, lab29, type Lab29Output } from './run.js';
import { finalizeRouting, matches, ROUTES, unmatched } from './routing.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab29]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-29', { input: { ...lab29.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  return runner.events(r.runId).find((e) => e.type === 'result') as {
    output: Lab29Output;
    validation: { passed: boolean; checks: { id: string; passed: boolean }[] };
  };
}
const check = (v: { checks: { id: string; passed: boolean }[] }, id: string) => v.checks.find((c) => c.id === id)?.passed;

describe('lab-29 predicates (unit)', () => {
  it('exclusive predicates plus the fallback match exactly one route for every severity 0–4', () => {
    for (let s = 0; s <= 4; s++) {
      const n = ROUTES.filter((r) => matches(r, s, 'exclusive')).length + (unmatched(s, 'exclusive') ? 1 : 0);
      expect(n, `severity ${s}`).toBe(1);
    }
  });
  it('overlapping thresholds match several routes for high severities', () => {
    expect(ROUTES.filter((r) => matches(r, 4, 'overlapping')).length).toBe(3);
  });
  it('finalize makes zero and several branches explicit', () => {
    const rec = { route: 'x', queue: 'q', slaMinutes: 1, actions: [] };
    expect(finalizeRouting('T-1', {}).outcome).toBe('UNROUTED');
    expect(finalizeRouting('T-1', { a: rec, b: rec }).outcome).toBe('AMBIGUOUS_ROUTE');
    expect(finalizeRouting('T-1', { a: rec }).route).toBe('a');
  });
  it('offline assessment is keyword based', () => {
    expect(assessOffline('Everything is down').severity).toBe(4);
    expect(assessOffline('Hello there').severity).toBe(0);
  });
});

describe('lab-29 conditional branching (DoD)', () => {
  it('every fixture ticket follows its expected branch, exactly one each', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.outcomes.map((o) => o.branchesRun)).toEqual([['page-oncall'], ['priority-queue'], ['standard-queue'], ['manual-review']]);
    expect(output.outcomes.map((o) => o.source)).toEqual(['assessed', 'pre-assessed', 'assessed', 'pre-assessed']);
  });

  it('overlapping predicates run several branches and are reported as AMBIGUOUS_ROUTE', async () => {
    const { output, validation } = await run({ predicateStyle: 'overlapping' });
    const t101 = output.outcomes[0]!;
    expect(t101.branchesRun).toEqual(['page-oncall', 'priority-queue', 'standard-queue']);
    expect(t101.routing?.outcome).toBe('AMBIGUOUS_ROUTE');
    expect(check(validation, 'exactly-one-branch')).toBe(false);
  });

  it('without the fallback the unassessable ticket is UNROUTED, not silently dropped', async () => {
    const { output, validation } = await run({ fallback: false });
    const t104 = output.outcomes[3]!;
    expect(t104.status).toBe('success'); // Mastra itself reports success with no branch run
    expect(t104.branchesRun).toEqual([]);
    expect(t104.routing?.outcome).toBe('UNROUTED');
    expect(check(validation, 'unmatched-handled')).toBe(false);
  });

  it('rejects an oversized batch', () => {
    const t = { ticketId: 'T-1', text: 'x', severity: 1, expectRoute: 'standard-queue' };
    expect(lab29.inputSchema.safeParse({ ...lab29.definition.exampleInput, tickets: Array(9).fill(t) }).success).toBe(false);
  });
});
