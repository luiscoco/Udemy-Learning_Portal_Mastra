import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionEvent } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { AuditTrail, checkRefundPolicy, createSupportTools, RefundLedger } from './policy.js';
import { lab15, parseRequest, type Lab15Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab15]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown>) {
  const r = runner.start('lab-15', { input: { ...lab15.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  const events: readonly ExecutionEvent[] = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as { output: Lab15Output; validation: { passed: boolean } };
  return { events, out: result.output, passed: result.validation.passed };
}

describe('lab-15 policy (unit)', () => {
  it('parses the offline intent', () => {
    expect(parseRequest('Please refund 45.00 on order ORD-1001')).toEqual({
      orderId: 'ORD-1001',
      amountCents: 4500,
      action: 'issueRefund',
    });
    expect(parseRequest('delete my account, ORD-1003')).toMatchObject({ action: 'deleteCustomer' });
  });

  it('enforces limit, amount paid and idempotency', () => {
    const ledger = new RefundLedger();
    expect(checkRefundPolicy('support-agent', { orderId: 'ORD-1002', amountCents: 45_000 }, ledger)?.code).toBe('OVER_LIMIT');
    expect(checkRefundPolicy('support-agent', { orderId: 'ORD-1003', amountCents: 1900 }, ledger)?.code).toBe('OVER_PAID');
    expect(checkRefundPolicy('viewer', { orderId: 'ORD-1001', amountCents: 100 }, ledger)?.code).toBe('ROLE_NOT_ALLOWED');
    ledger.entries.push({ refundId: 'RF-0001', orderId: 'ORD-1001', amountCents: 100 });
    expect(checkRefundPolicy('support-agent', { orderId: 'ORD-1001', amountCents: 100 }, ledger)?.code).toBe('ALREADY_REFUNDED');
  });

  it('only hands allowed tools to each role', () => {
    const deps = { actor: 't', audit: new AuditTrail(), ledger: new RefundLedger() };
    expect(Object.keys(createSupportTools({ role: 'viewer', ...deps }))).toEqual(['lookupOrder']);
    expect(Object.keys(createSupportTools({ role: 'support-agent', ...deps }))).toEqual(['lookupOrder', 'issueRefund']);
  });

  it('audit trail is append-only', () => {
    const audit = new AuditTrail();
    const e = audit.append({ toolName: 'x', args: {}, decision: 'read', reason: 'r', actor: 'a' });
    expect(() => ((e as { reason: string }).reason = 'changed')).toThrow();
    (audit.entries as unknown[]).length = 0;
    expect(audit.entries).toHaveLength(1);
  });
});

describe('lab-15 approval flow (native requireApproval)', () => {
  it('approved refund suspends, resumes and changes the ledger exactly once', async () => {
    const { events, out, passed } = await run({});
    expect(passed).toBe(true);
    expect(out.refundExecutions).toBe(1);
    expect(out.ledger).toEqual([{ refundId: 'RF-0001', orderId: 'ORD-1001', amountCents: 4500 }]);
    expect(out.audit.map((e) => e.decision)).toEqual(['read', 'approval-requested', 'approved', 'executed']);
    const suspended = events.findIndex((e) => e.type === 'workflow-step' && e.status === 'suspended');
    const finish = events.findIndex((e) => e.type === 'tool-finish' && e.toolName === 'issueRefund');
    expect(suspended).toBeGreaterThan(-1);
    expect(finish).toBeGreaterThan(suspended);
  });

  it('declined refund never executes and is reported as denied', async () => {
    const { events, out, passed } = await run({ userDecision: 'decline' });
    expect(passed).toBe(true);
    expect(out.refundExecutions).toBe(0);
    expect(out.ledger).toEqual([]);
    expect(events.some((e) => e.type === 'tool-finish' && e.toolName === 'issueRefund' && e.status === 'denied')).toBe(true);
    expect(out.answer).toMatch(/not issued/);
  });

  it('viewer cannot reach the refund tool at all', async () => {
    const { out, passed } = await run({ role: 'viewer' });
    expect(passed).toBe(true);
    expect(out.approvals).toEqual([]);
    expect(out.toolCalls.find((t) => t.toolName === 'issueRefund')?.status).toBe('error');
    expect(out.audit.map((e) => e.decision)).toContain('blocked');
  });

  it('policy denies an approved refund above the limit', async () => {
    const { out, passed } = await run({ request: 'Refund 450.00 on ORD-1002 please.' });
    expect(passed).toBe(true);
    expect(out.ledger).toEqual([]);
    expect(out.audit.map((e) => e.decision)).toEqual(['read', 'approval-requested', 'approved', 'denied-by-policy']);
    expect(out.answer).toContain('need a manager');
  });
});
