import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab75Definition } from './definition.js';
import { ToolBudget, eligible, issueRefund, ledgerOf, lookupCase } from './policy.js';
import { lab75, Lab75OutputSchema } from './run.js';

const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-75') });
const runner = new LabRunner({
  registry: new LabRegistry([lab75]),
  services,
  servicesFor: (o) => services.forTenant(o),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab75Definition.exampleInput;
let sequence = 0;
const owner = () => `dev:capstone-${process.pid}-${++sequence}`;
async function run(input: Record<string, unknown> = {}, ownerId = owner()) {
  const started = runner.start('lab-75', { input: { ...base, ...input } }, { ownerId });
  const snapshot = await runner.waitFor(started.runId);
  const events = runner.events(started.runId);
  const result = events.find((e) => e.type === 'result');
  expect(snapshot.status, JSON.stringify(events.filter((e) => e.type === 'error'))).toBe('succeeded');
  const output = Lab75OutputSchema.parse(result?.type === 'result' ? result.output : undefined);
  expect(
    result?.type === 'result' && result.validation?.passed,
    JSON.stringify({
      validation: result?.type === 'result' ? result.validation : null,
      spans: output.traceTree.spans.map((s) => ({
        type: s.type,
        entity: s.entity,
        status: s.status,
        correlationId: s.correlationId,
      })),
    }),
  ).toBe(true);
  return { output: Lab75OutputSchema.parse(result?.type === 'result' ? result.output : undefined), events };
}
async function awaitingApproval(ownerId: string) {
  const started = runner.start('lab-75', { input: { ...base, approver: 'ask' } }, { ownerId });
  const request = await new Promise<{ approvalId: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('No approval request arrived.'));
    }, 15000);
    const off = runner.subscribe(started.runId, (event) => {
      if (event.type === 'approval-request') {
        clearTimeout(timer);
        resolve(event);
      }
      if (event.type === 'complete') {
        clearTimeout(timer);
        reject(new Error('Run ended without approval.'));
      }
    });
  });
  return { ...started, request };
}

describe('capstone action boundary', () => {
  it('does not disclose foreign cases or allow invalid eligibility', () => {
    expect(lookupCase('alice', 'case-foreign')).toEqual({ available: false });
    expect(lookupCase('alice', 'unknown')).toEqual({ available: false });
    expect(eligible('alice', 'case-100', 25000)).toBe(true);
    for (const amount of [0, -1, 25001, 1.5, Infinity, NaN]) expect(eligible('alice', 'case-100', amount)).toBe(false);
    expect(eligible('alice', 'case-expired', 100)).toBe(false);
  });
  it('rechecks permission, quality, approval and cancellation before writing', () => {
    const tenant = services.forTenant(owner());
    const request = {
      services: tenant,
      signal: new AbortController().signal,
      caseId: 'case-100',
      amountCents: 12500,
      qualityPassed: true,
      approved: true,
    };
    expect(issueRefund({ ...request, approved: false }).status).toBe('blocked');
    expect(issueRefund({ ...request, qualityPassed: false }).status).toBe('blocked');
    expect(issueRefund({ ...request, caseId: 'case-foreign' }).status).toBe('blocked');
    expect(issueRefund({ ...request, amountCents: 25001 }).status).toBe('blocked');
    expect(() => issueRefund({ ...request, signal: AbortSignal.abort(new Error('cancelled')) })).toThrow('cancelled');
    expect(ledgerOf(tenant).receipts).toEqual({});
    const first = issueRefund(request);
    expect(first.status).toBe('issued');
    expect(issueRefund(request)).toMatchObject({ status: 'already-issued', receipt: first.receipt });
    expect(issueRefund({ ...request, amountCents: 100 })).toMatchObject({ status: 'conflict', receipt: first.receipt });
    expect(Object.keys(ledgerOf(tenant).receipts)).toEqual(['case-100']);
  });
  it('enforces the tool budget and an already aborted signal', () => {
    const budget = new ToolBudget();
    for (let i = 0; i < budget.limit; i++) budget.take(new AbortController().signal);
    expect(() => budget.take(new AbortController().signal)).toThrow('budget');
    expect(() => new ToolBudget().take(AbortSignal.abort(new Error('cancelled')))).toThrow('cancelled');
  });
});

describe('Lab 75 integrated assistant', () => {
  it('uses two agents, real MCP, fresh citations, memory, scoring and one receipt across repeats', async () => {
    const id = owner();
    const first = await run({}, id);
    expect(first.output.action.status).toBe('issued');
    expect(first.output.quality.score).toBe(1);
    expect(first.output.citedAnswer.claims.length).toBeGreaterThan(0);
    expect(first.events.some((e) => e.type === 'tool-start' && e.toolName === 'support_lookup_case')).toBe(true);
    expect(first.output.mcp).toMatchObject({ closed: true, openSockets: 0, lookupCalls: 1 });
    const second = await run({}, id);
    expect(second.output.action).toMatchObject({ status: 'already-issued', receipt: first.output.action.receipt });
    expect(second.output.memory.beforeMessages).toBe(first.output.memory.afterMessages);
    expect(second.output.budget.toolsUsed).toBe(3);
    expect(JSON.stringify(first.output)).not.toContain('Bearer ');
  });
  it.each([
    [{ caseId: 'case-foreign' }, 'blocked'],
    [{ caseId: 'case-expired' }, 'blocked'],
    [{ amountCents: 30000 }, 'blocked'],
    [{ approver: 'decline' }, 'declined'],
    [{ fault: 'bad-citation' }, 'blocked'],
    [{ question: 'Explain quantum entanglement.' }, 'blocked'],
    [{ action: 'answer' }, 'not-requested'],
  ])('safely handles %j', async (input, status) => {
    const { output } = await run(input as Record<string, unknown>);
    expect(output.action.status).toBe(status);
    expect(output.action.receipt).toBeNull();
  });
  it('isolates equal thread/case ids between tenants and serializes duplicate requests', async () => {
    const alice = owner();
    const bob = owner();
    const [a, b] = await Promise.all([run({}, alice), run({}, bob)]);
    expect(a.output.action.status).toBe('issued');
    expect(b.output.action.status).toBe('issued');
    expect(a.output.action.receipt?.id).not.toBe(b.output.action.receipt?.id);
    expect(a.output.memory.beforeMessages).toBe(0);
    expect(b.output.memory.beforeMessages).toBe(0);
    const id = owner();
    const requests = await Promise.all([run({}, id), run({}, id)]);
    expect(requests.map((r) => r.output.action.status).sort()).toEqual(['already-issued', 'issued']);
    expect(Object.keys(ledgerOf(services.forTenant(id)).receipts)).toHaveLength(1);
  });
  it('uses an interactive decision and rejects a duplicate decision', async () => {
    const id = owner();
    const pending = await awaitingApproval(id);
    expect(ledgerOf(services.forTenant(id)).receipts).toEqual({});
    runner.resolveApproval(pending.runId, pending.request.approvalId, 'approve');
    expect(() => runner.resolveApproval(pending.runId, pending.request.approvalId, 'approve')).toThrow();
    await runner.waitFor(pending.runId);
    const result = runner.events(pending.runId).find((e) => e.type === 'result');
    expect(result?.type === 'result' && Lab75OutputSchema.parse(result.output).action.status).toBe('issued');
  });
  it('cancels a pending approval without a receipt and permits the next run', async () => {
    const id = owner();
    const pending = await awaitingApproval(id);
    runner.cancel(pending.runId);
    expect((await runner.waitFor(pending.runId)).status).toBe('cancelled');
    expect(ledgerOf(services.forTenant(id)).receipts).toEqual({});
    expect((await run({}, id)).output.action.status).toBe('issued');
  });
});
