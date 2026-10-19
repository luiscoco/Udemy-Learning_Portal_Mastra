import { afterAll, describe, expect, it } from 'vitest';
import { CitedAnswerSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { SLIPS } from '../lab-51/workflow.js';
import { classifyClaims } from './claims.js';
import { lab55Definition } from './definition.js';
import { planOffline, poolNotes } from './plan.js';
import { lab55, type Lab55Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab55]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab55Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-55', { input: { ...lab55Definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return result;
}

describe('lab-55 plan, pool and claims (unit)', () => {
  it('plans sub-questions and pools unique notes', () => {
    expect(planOffline(lab55Definition.exampleInput.question).subQuestions).toEqual(
      lab55Definition.expectedOutput.example.subQuestions,
    );
    expect(planOffline('Tell me about memory.').subQuestions).toEqual([
      'Tell me about memory.',
      'How does a Mastra workflow run its steps?',
    ]);
    const note = { n: 1, claim: 'c', sourceId: 'S1', quote: 'q' };
    const pooled = poolNotes([
      { index: 2, subQuestion: 'b', researcher: 'researcher-2', notes: [note, { ...note, n: 2, quote: 'r' }], rejected: 0 },
      { index: 1, subQuestion: 'a', researcher: 'researcher-1', notes: [note], rejected: 0 },
    ]);
    expect(pooled.map((n) => [n.n, n.quote, n.from])).toEqual([
      [1, 'q', 'researcher-1'],
      [2, 'r', 'researcher-2'],
    ]);
  });
  it('flags structural issues even when the fact-checker approves', () => {
    const notes = [{ n: 1, claim: 'Steps run in order', sourceId: 'S1', quote: 'runs in a fixed, explicit order' }];
    const { claims } = classifyClaims(`Steps run in order [1]. ${SLIPS['uncited-claim']}`, notes, [], SLIPS['uncited-claim']);
    expect(claims.map((c) => [c.status, c.injected])).toEqual([
      ['supported', false],
      ['flagged', true],
    ]);
  });
});

describe('lab-55 Research team capstone (DoD)', () => {
  it('surfaces the evidence and flags the unsupported claim', async () => {
    const { output, validation } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output).toMatchObject(lab55Definition.expectedOutput.example);
    expect(output.research.map((r) => r.researcher)).toEqual(['researcher-1', 'researcher-2', 'researcher-3']);
    expect(CitedAnswerSchema.safeParse(output.citedAnswer).success).toBe(true);
    const c = output.citedAnswer.claims[0]!.citations[0]!;
    expect(output.citedAnswer.sources[c.sourceId]!.text.slice(c.quoteStart, c.quoteEnd)).toBe(c.quote);
    expect(output.citedAnswer.blocked).toEqual([
      { text: SLIPS['unsupported-claim'], reasons: [expect.stringContaining('unsupported')] },
    ]);
    expect(output.final!.text).not.toContain('GPU');
  });

  it('a rejection publishes nothing', async () => {
    const { output, validation } = await run({ approver: 'reject' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.trace.afterApproval).toEqual(['approve', 'publish']);
    expect(output.citedAnswer.claims).toEqual([]);
  });

  it('asks the learner, then publishes after approval', async () => {
    const r = runner.start('lab-55', { input: { ...lab55Definition.exampleInput, approver: 'ask' } });
    for (let i = 0; i < 200 && !runner.events(r.runId).some((e) => e.type === 'approval-request'); i++)
      await new Promise((x) => setTimeout(x, 25));
    const req = runner.events(r.runId).find((e) => e.type === 'approval-request') as
      { approvalId: string; message: string } | undefined;
    expect(req?.message).toMatch(/^Publish \d+ supported claim\(s\)\? 1 flagged claim\(s\) will be withheld\.$/);
    runner.resolveApproval(r.runId, req!.approvalId, 'approve');
    await runner.waitFor(r.runId);
    const res = runner.events(r.runId).find((e) => e.type === 'result') as unknown as Result;
    expect(res.validation.passed, JSON.stringify(res.validation.checks)).toBe(true);
    expect(res.output.approval.decision).toMatchObject({ decision: 'approve', source: 'learner' });
  });
});
