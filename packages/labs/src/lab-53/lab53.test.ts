import { afterAll, describe, expect, it } from 'vitest';
import { AgentConversationSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { decideDelegation, Ledger, normalisePrompt } from './budget.js';
import { lab53Definition } from './definition.js';
import { lab53, type Lab53Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab53]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab53Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-53', { input: { ...lab53Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}
const decisions = (o: Lab53Output) => o.audit.map((a) => `${a.worker}:${a.decision}${a.reason ? `:${a.reason}` : ''}`);

describe('lab-53 budget guard (unit)', () => {
  const limits = { maxDelegations: 3, perWorkerLimit: 2, tokenBudget: 100 };
  it('checks duplicate, total cap, per-worker cap and token budget, and reserves at start', () => {
    const l = new Ledger();
    expect(decideDelegation(l, limits, 'researcher', 'Research X')).toEqual({ accepted: true });
    expect(l.accepted).toBe(1); // reserved before the delegation completes
    expect(decideDelegation(l, limits, 'researcher', 'research   x!')).toMatchObject({ reason: 'duplicate' });
    expect(decideDelegation(l, limits, 'researcher', 'Research Y')).toEqual({ accepted: true });
    expect(decideDelegation(l, limits, 'researcher', 'Research Z')).toMatchObject({ reason: 'per-worker-cap' });
    l.spend(100);
    expect(decideDelegation(l, limits, 'planner', 'Plan')).toMatchObject({ reason: 'token-budget' });
    l.spentTokens = 0;
    expect(decideDelegation(l, limits, 'planner', 'Plan')).toEqual({ accepted: true });
    expect(decideDelegation(l, limits, 'analyst', 'Analyse')).toMatchObject({ reason: 'total-cap' });
    expect(decideDelegation(l, limits, 'writer', 'x')).toMatchObject({ reason: 'unknown-worker' });
    expect(normalisePrompt(' Research: X? ')).toBe('research x');
  });
});

describe('lab-53 Supervisor pattern (DoD)', () => {
  it('dispatches research, planning and analysis with every decision audited', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(decisions(output)).toEqual(['researcher:accepted', 'planner:accepted', 'analyst:accepted']);
    expect(output.audit[0]).toMatchObject(lab53Definition.expectedOutput.example.audit[0]!);
    expect(output.audit[1]!.budgetBefore.delegations).toBe(1);
    expect(output.audit.every((a) => (a.completion?.tokens ?? 0) > 0)).toBe(true);
    expect(output.outcome.answer).toMatch(/^Research: .+\[S1\][\s\S]*Plan: 1\.[\s\S]*Analysis: Risks/);
    expect(AgentConversationSchema.safeParse(output.agentConversation).success).toBe(true);
  });

  it('a repeated delegation is refused as a cycle', async () => {
    const { output, validation } = await run({ fault: 'repeat-delegation' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(decisions(output)).toContain('researcher:refused:duplicate');
    expect(output.agentConversation.messages.some((m) => m.kind === 'refusal' && m.summary.includes('duplicate'))).toBe(true);
  });

  it('a runaway supervisor stops at its iteration cap with the partial results', async () => {
    const { output, validation } = await run({ fault: 'runaway' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.supervisorSteps).toBe(6);
    expect(output.outcome).toMatchObject({ status: 'stopped', answer: '' });
    expect(output.outcome.partial.map((p) => p.worker)).toEqual(['researcher', 'planner', 'analyst']);
    expect(output.audit.slice(3).every((a) => a.reason === 'per-worker-cap')).toBe(true);
  });

  it('a tight token budget refuses the later workers', async () => {
    const { output, validation } = await run({ tokenBudget: 10 });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(decisions(output)).toEqual(['researcher:accepted', 'planner:refused:token-budget', 'analyst:refused:token-budget']);
    expect(output.outcome.answer).toContain('Plan: not available');
  });

  it('flags an over-budget delegation in the audit', async () => {
    const { output } = await run();
    const tampered = {
      ...output,
      audit: output.audit.map((a, i) => (i === 2 ? { ...a, budgetBefore: { ...a.budgetBefore, tokens: 99_999 } } : a)),
    };
    const v = lab53.validate!(tampered, lab53Definition.exampleInput as never, {
      events: [],
      mode: 'offline',
    }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'budget-respected')?.passed).toBe(false);
  });
});
