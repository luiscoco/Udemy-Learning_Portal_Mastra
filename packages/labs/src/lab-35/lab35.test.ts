import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { checkControls, mediaScan, registryLookup, sanctionsScreen, scoreRisk, type VendorCase } from './rules.js';
import { lab35, type Lab35Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab35]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab35') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab35.definition.exampleInput as { cases: (VendorCase & { reviewAttempts: unknown[]; expectBranch: string })[] } & Record<string, unknown>;
type Result = { output: Lab35Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-35', { input: { ...example, ...overrides } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-3)));
  return result;
}
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;
const kase = (o: Lab35Output, id: string) => o.cases.find((c) => c.caseId === id)!;

describe('lab-35 rules (unit): every risk level and every control', () => {
  const assess = (c: VendorCase) => scoreRisk(c, { registry: registryLookup(c.vendor), sanctions: sanctionsScreen(c.vendor), media: mediaScan(c.notes) });
  it('scores low, medium, high and blocked', () => {
    expect(example.cases.map((c) => assess(c).level)).toEqual(['low', 'medium', 'high', 'blocked']);
    expect(assess(example.cases[2]!).score).toBe(5);
  });
  it('a dissolved company is not an active registry match', () => {
    expect(registryLookup({ name: 'Lumen Print Works', country: 'ES', registrationId: 'REG-5005' }).found).toBe(false);
  });
  it('controls: SOD, AUTHORITY and RATIONALE', () => {
    const ok = { reviewer: 'maria', role: 'senior' as const, decision: 'approve' as const, rationale: 'References checked and confirmed.' };
    expect(checkControls('leo', 'high', ok)).toEqual([]);
    expect(checkControls('maria', 'medium', ok)).toEqual(['SOD']);
    expect(checkControls('leo', 'high', { ...ok, role: 'manager' })).toEqual(['AUTHORITY']);
    expect(checkControls('leo', 'medium', { ...ok, role: 'analyst', rationale: 'ok' })).toEqual(['AUTHORITY', 'RATIONALE']);
  });
});

describe('lab-35 business process capstone (DoD)', () => {
  it('every branch is exercised and reviewer controls are enforced', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(output.cases.map((c) => c.branch)).toEqual(['auto-approved', 'approved', 'rejected', 'blocked']);
    expect(kase(output, 'C-102').audit.map((a) => [a.reviewer, a.accepted, a.violations])).toEqual([
      ['leo', false, ['SOD']],
      ['maria', true, []],
    ]);
    expect(kase(output, 'C-103').audit.map((a) => [a.reviewer, a.accepted, a.violations])).toEqual([
      ['maria', false, ['AUTHORITY']],
      ['sofia', true, []],
    ]);
    expect(kase(output, 'C-104').audit).toEqual([]); // blocked: never offered for review
    expect(kase(output, 'C-101').trace).toEqual(expect.arrayContaining(['intake', 'registryLookup', 'sanctionsScreen', 'mediaScan', 'riskReview', 'autoApprove', 'report']));
    expect(kase(output, 'C-102').report?.decision).toMatchObject({ reviewer: 'maria', role: 'manager' });
  });

  it('controls disabled: the self-approval is accepted and the check fails', async () => {
    const { output, validation } = await run({ controls: 'disabled' });
    expect(kase(output, 'C-102').report?.decision?.reviewer).toBe('leo');
    expect(check(validation, 'reviewer-controls-enforced')).toBe(false);
  });

  it('attempts exhausted: pending-review, nothing approved', async () => {
    const c = example.cases[1]!;
    const bad = c.reviewAttempts[0]!;
    const { output, validation } = await run({ cases: [{ ...c, reviewAttempts: [bad, bad, bad], expectBranch: 'pending-review' }] });
    expect(output.cases[0]).toMatchObject({ branch: 'pending-review', report: { branch: 'pending-review', decision: null } });
    expect(output.cases[0]!.audit).toHaveLength(3);
    expect(validation.passed).toBe(true);
  });

  it('a case without a valid reviewer yet stays awaiting review', async () => {
    const c = example.cases[2]!;
    const { output } = await run({ cases: [{ ...c, reviewAttempts: [c.reviewAttempts[0]], expectBranch: 'rejected' }] });
    expect(output.cases[0]).toMatchObject({ branch: 'awaiting-review', report: null });
  });
});
