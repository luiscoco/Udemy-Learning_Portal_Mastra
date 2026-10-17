import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab31, NESTED_STEPS, screenOffline, type Lab31Output } from './run.js';
import { checkIdentityRules, decideVerification } from './verification.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab31]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-31', { input: { ...lab31.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  return {
    events,
    result: events.find((e) => e.type === 'result') as {
      output: Lab31Output;
      validation: { passed: boolean; checks: { id: string; passed: boolean; message?: string }[] };
    },
  };
}
const check = (v: { checks: { id: string; passed: boolean }[] }, id: string) => v.checks.find((c) => c.id === id)?.passed;

describe('lab-31 rules (unit)', () => {
  it('identity, risk and decision', () => {
    expect(checkIdentityRules('a@mailinator.com').identityOk).toBe(false);
    expect(checkIdentityRules('not-an-email').identityOk).toBe(false);
    expect(checkIdentityRules('a@example.com').identityOk).toBe(true);
    expect(screenOffline({ email: '', country: 'ES', total: 10, notes: 'reship gift cards' }).riskLevel).toBe('high');
    expect(screenOffline({ email: '', country: 'ES', total: 2500, notes: '' }).riskLevel).toBe('medium');
    expect(decideVerification({ identityOk: true, reasons: [] }, { riskLevel: 'medium', reasons: [] }).verified).toBe(true);
    expect(decideVerification({ identityOk: false, reasons: ['x'] }, null)).toMatchObject({ verified: false, riskLevel: 'not-screened' });
  });
});

describe('lab-31 nested workflows (DoD)', () => {
  it('subworkflow steps are visible in the trace and decisions are correct', async () => {
    const { result, events } = await run();
    expect(result.validation.passed).toBe(true);
    const o = result.output.outcomes[0]!;
    expect(o.trace).toEqual(['prepareOrder', ...NESTED_STEPS, 'verify-customer', 'fulfil']);
    expect(result.output.outcomes.map((x) => x.fulfilment?.decision)).toEqual(['approved', 'held', 'held']);
    expect(events.some((e) => e.type === 'workflow-step' && e.stepId === 'verify-customer.screenRisk')).toBe(true);
    // The identity failure skips the model; standalone runs reuse the cached screenings.
    expect(result.output.screenings).toEqual({ calls: 2, reused: 2 });
  });

  it('only the declared keys cross the boundary, even when the whole order is passed to a strict schema', async () => {
    const { result } = await run({ boundaryFault: 'whole-order' });
    expect(result.validation.passed).toBe(true);
    for (const o of result.output.outcomes) expect(o.receivedKeys).toEqual(['country', 'email', 'notes', 'total']);
  });

  it('a loose schema leaks order fields', async () => {
    const { result } = await run({ boundaryFault: 'loose-schema' });
    expect(result.output.outcomes[0]!.receivedKeys).toEqual(expect.arrayContaining(['cardLast4', 'shippingAddress', 'items']));
    expect(check(result.validation, 'input-boundary')).toBe(false);
  });

  it('a malformed subworkflow output is attributed to the subworkflow', async () => {
    const { result } = await run({ boundaryFault: 'bad-output' });
    const o = result.output.outcomes[0]!;
    expect(o.workflowStatus).toBe('failed'); // Mastra fails later, at fulfil’s input validation
    expect(o.outputBoundary.valid).toBe(false);
    expect(o.outputBoundary.issues[0]).toMatch(/^verify-customer output/);
    expect(check(result.validation, 'output-boundary')).toBe(false);
  });
});
