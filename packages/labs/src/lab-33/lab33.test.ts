import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { resolveDecision } from './refunds.js';
import { lab33, summarizeOffline, type Lab33Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab33]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab33') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

const example = lab33.definition.exampleInput as { requests: Record<string, unknown>[] } & Record<string, unknown>;
type Result = { output: Lab33Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };

async function waitResult(runId: string) {
  await runner.waitFor(runId);
  const events = runner.events(runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'complete' || e.type === 'log').slice(-3)));
  return result;
}
const run = (overrides: Record<string, unknown> = {}) => waitResult(runner.start('lab-33', { input: { ...example, ...overrides } }).runId);
const check = (v: Result['validation'], id: string) => v.checks.find((c) => c.id === id)?.passed;
const req = (o: Lab33Output, id: string) => o.requests.find((q) => q.refundId === id)!;

describe('lab-33 rules (unit)', () => {
  it('expiry is decided inside the workflow', () => {
    const exp = new Date(1_000_000).toISOString();
    expect(resolveDecision({ decision: 'approve', supervisor: 'm' }, exp, 999_999).status).toBe('approved');
    expect(resolveDecision({ decision: 'approve', supervisor: 'm' }, exp, 1_000_001).status).toBe('expired');
    expect(resolveDecision({ decision: 'expire', supervisor: 'sweep' }, exp, 0).status).toBe('expired');
    expect(resolveDecision({ decision: 'reject', supervisor: 'm' }, exp, 0).status).toBe('rejected');
  });
  it('offline recommendations', () => {
    expect(summarizeOffline({ refundId: 'R-1', orderId: 'O-1', customer: 'c', amount: 20, reason: 'arrived broken' }).recommendation).toBe('approve');
    expect(summarizeOffline({ refundId: 'R-1', orderId: 'O-1', customer: 'c', amount: 900, reason: 'arrived broken' }).recommendation).toBe('reject');
  });
});

describe('lab-33 human approval (DoD)', () => {
  it('demo: no refund on reject or timeout; the approved path pays once despite a lost acknowledgement', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    expect(req(output, 'R-1001')).toMatchObject({ status: 'refunded', payments: 1, paymentsBeforeDecision: 0, final: { attempts: 2, replayed: true } });
    expect(req(output, 'R-1002')).toMatchObject({ status: 'rejected', payments: 0 });
    expect(req(output, 'R-1003')).toMatchObject({ status: 'expired', payments: 0 });
    expect(output.duplicateApproval).toMatchObject({ code: 'NOT_SUSPENDED', paymentsBefore: 1, paymentsAfter: 1 });
    expect(output.lateApproval).toMatchObject({ refundId: 'R-1003', code: 'NOT_SUSPENDED', paymentsAfter: 0 });
    expect(output.payments).toHaveLength(1);
  });

  it('without an idempotency key the retry pays twice', async () => {
    const { output, validation } = await run({ idempotency: 'none' });
    expect(req(output, 'R-1001').payments).toBe(2);
    expect(check(validation, 'approved-refunded-once')).toBe(false);
  });

  it('ask: the learner decides in the Run tab; declining pays nothing', async () => {
    const requests = example.requests.map((r) => (r.refundId === 'R-1003' ? { ...r, supervisorDecision: 'ask' } : r));
    const started = runner.start('lab-33', { input: { ...example, requests } });
    for (let i = 0; i < 200 && !runner.events(started.runId).some((e) => e.type === 'approval-request'); i++) await new Promise((r) => setTimeout(r, 25));
    const prompt = runner.events(started.runId).find((e) => e.type === 'approval-request') as { approvalId: string };
    runner.resolveApproval(started.runId, prompt.approvalId, 'decline', 'not covered by policy');
    const { output } = await waitResult(started.runId);
    expect(req(output, 'R-1003')).toMatchObject({ status: 'rejected', payments: 0, decisionSource: 'learner' });
  });

  it('start, then decide by id in a separate lab run, then a late duplicate is rejected', async () => {
    const started = await run({ action: 'start', requests: [example.requests[0]] });
    expect(started.validation.passed).toBe(true);
    const id = started.output.requests[0]!.workflowRunId;
    const decided = await run({ action: 'decide', workflowRunId: id, decision: 'approve', ackFailures: 0 });
    expect(decided.output.requests[0]).toMatchObject({ refundId: 'R-1001', status: 'refunded', payments: 1, final: { attempts: 1, replayed: false } });
    const again = await run({ action: 'decide', workflowRunId: id, decision: 'approve' });
    expect(again.output.requests[0]).toMatchObject({ status: 'error', error: { code: 'NOT_SUSPENDED' }, payments: 1 });
  });

  it('sweep (system clock) leaves requests that are still inside their window alone', async () => {
    const started = await run({ action: 'start', requests: [example.requests[2]], ttlMinutes: 1440 });
    const id = started.output.requests[0]!.workflowRunId;
    const swept = await run({ action: 'sweep' });
    expect(swept.output.requests.some((q) => q.workflowRunId === id)).toBe(false);
  });
});
