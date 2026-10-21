import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { AuditLog, argsHashOf, mask } from './audit.js';
import { lab64Definition } from './definition.js';
import { DEFAULT_POLICY, eligibleApprover, evaluate, PolicySchema } from './policy.js';
import { Lab64InputSchema, lab64, parseRequest, type Lab64Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab64]),
  services: createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-64') }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab64Definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-64', { input });
  const snap = await runner.waitFor(r.runId);
  const result = runner.events(r.runId).find((e) => e.type === 'result');
  return { snap, runId: r.runId, result: result?.type === 'result' ? result : undefined };
}

describe('policy', () => {
  it('first match wins, conditions apply, and no match means deny', () => {
    const p = DEFAULT_POLICY;
    expect(evaluate(p, { role: 'support-agent', toolName: 'issueRefund', args: { amountCents: 3000 } }).ruleId).toBe(
      'small-refund',
    );
    expect(evaluate(p, { role: 'support-agent', toolName: 'issueRefund', args: { amountCents: 18000 } })).toMatchObject({
      ruleId: 'large-refund',
      effect: 'confirm',
    });
    expect(evaluate(p, { role: 'support-agent', toolName: 'issueRefund', args: { amountCents: 60000 } })).toMatchObject({
      ruleId: 'default',
      effect: 'deny',
    });
    expect(evaluate(p, { role: 'support-agent', toolName: 'closeAccount', args: {} }).effect).toBe('deny');
    expect(evaluate(p, { role: 'viewer', toolName: 'unknownTool', args: {} }).ruleId).toBe('default');
  });
  it('rejects fail-open, duplicate and incomplete policies', () => {
    expect(PolicySchema.safeParse({ ...DEFAULT_POLICY, default: 'allow' }).success).toBe(false);
    expect(PolicySchema.safeParse({ ...DEFAULT_POLICY, rules: [...DEFAULT_POLICY.rules, DEFAULT_POLICY.rules[0]] }).success).toBe(
      false,
    );
    const noApprovers = { id: 'x', tools: ['changeEmail'], roles: ['viewer'], effect: 'confirm' };
    expect(PolicySchema.safeParse({ default: 'deny', rules: [noApprovers] }).success).toBe(false);
    expect(
      PolicySchema.safeParse({ default: 'deny', rules: [{ ...noApprovers, effect: 'allow', tools: ['rmRf'] }] }).success,
    ).toBe(false);
  });
  it('separation of duties: never self, only the roles a rule names', () => {
    const d = evaluate(DEFAULT_POLICY, { role: 'supervisor', toolName: 'closeAccount', args: {} });
    expect(eligibleApprover(d, 'self').ok).toBe(false);
    expect(eligibleApprover(d, 'team-lead').ok).toBe(false);
    expect(eligibleApprover(d, 'manager').ok).toBe(true);
  });
  it('parses operator requests into calls', () => {
    expect(parseRequest(base.request).map((c) => c.toolName)).toEqual([
      'issueRefund',
      'issueRefund',
      'changeEmail',
      'closeAccount',
    ]);
  });
});

describe('audit log', () => {
  it('chains entries, masks e-mail addresses and detects tampering', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mlp-audit-')), 'audit.jsonl');
    const log = new AuditLog(file);
    const fields = (n: number) => ({
      runId: 'r',
      actor: 'a',
      role: 'support-agent',
      toolName: 'changeEmail',
      toolCallId: `c${n}`,
      argsHash: argsHashOf({ n }),
      args: mask({ newEmail: 'jordan@customer.example' }),
      stage: 'policy' as const,
      decision: 'confirm',
      reason: 'x',
    });
    await Promise.all([1, 2, 3].map((n) => log.append(fields(n)))); // concurrent appends never fork the chain
    expect(log.verify()).toEqual({ valid: true, entries: 3 });
    expect(readFileSync(file, 'utf8')).not.toContain('jordan@');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    writeFileSync(file, `${[lines[0], lines[1]!.replace('"confirm"', '"allow"'), lines[2]].join('\n')}\n`);
    expect(log.verify()).toMatchObject({ valid: false, brokenAt: 2 });
    writeFileSync(file, `${[lines[0], lines[2]].join('\n')}\n`); // a removed line
    expect(log.verify()).toMatchObject({ valid: false, brokenAt: 2 });
  });
  it('argument hashes ignore key order', () => {
    expect(argsHashOf({ a: 1, b: 2 })).toBe(argsHashOf({ b: 2, a: 1 }));
  });
});

describe('Lab 64', () => {
  it('runs the example: allowed, confirmed and denied calls, with an intact audit', async () => {
    const { snap, result } = await run({ ...base, resetAudit: true });
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    const out = result!.output as Lab64Output;
    expect(out.decisions.map((d) => `${d.toolName}:${d.ruleId}:${d.outcome}`)).toEqual([
      'issueRefund:small-refund:executed',
      'issueRefund:large-refund:executed',
      'changeEmail:change-email:executed',
      'closeAccount:default:not-invoked',
    ]);
    expect(out.counters.closeAccount).toBe(0);
    expect(out.decisions.filter((d) => d.approval).map((d) => d.approval!.approver)).toEqual(['team-lead', 'team-lead']);
    expect(out.audit.after.valid).toBe(true);
    expect(JSON.stringify(out.audit.thisRun)).not.toContain('new.address@');
  });

  it('self-approval is refused without asking anyone', async () => {
    const r = runner.start('lab-64', { input: { ...base, approver: 'self', userDecision: 'ask' } });
    await runner.waitFor(r.runId);
    const events = runner.events(r.runId);
    expect(events.some((e) => e.type === 'approval-request')).toBe(false);
    const out = (events.find((e) => e.type === 'result') as { output: Lab64Output; validation: { passed: boolean } }).output;
    expect(out.decisions.filter((d) => d.approval).every((d) => d.approval!.decision === 'declined')).toBe(true);
    expect(out.counters).toMatchObject({ issueRefund: 1, changeEmail: 0, closeAccount: 0 });
  });

  it('ask mode: the learner decides each confirmation in turn', async () => {
    const r = runner.start('lab-64', { input: { ...base, userDecision: 'ask' } });
    const decided: string[] = [];
    for (let i = 0; i < 400 && runner.get(r.runId)?.status !== 'succeeded' && decided.length < 2; i++) {
      const open = runner
        .events(r.runId)
        .filter((e) => e.type === 'approval-request')
        .map((e) => (e.type === 'approval-request' ? e : null)!)
        .find((e) => !decided.includes(e.approvalId));
      if (open) {
        // Approve the refund, decline the e-mail change.
        runner.resolveApproval(r.runId, open.approvalId, open.toolName === 'issueRefund' ? 'approve' : 'decline');
        decided.push(open.approvalId);
      } else await new Promise((res) => setTimeout(res, 20));
    }
    expect(decided).toHaveLength(2);
    expect((await runner.waitFor(r.runId)).status).toBe('succeeded');
    const result = runner.events(r.runId).find((e) => e.type === 'result');
    const out = (result?.type === 'result' ? result.output : undefined) as Lab64Output;
    expect(result?.type === 'result' && result.validation?.passed).toBe(true);
    expect(out.counters).toMatchObject({ issueRefund: 2, changeEmail: 0 });
  });

  it('a tampered audit log fails its check until it is rotated', async () => {
    const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-64-tamper') });
    const own = new LabRunner({ registry: new LabRegistry([lab64]), services, liveEnabled: false });
    try {
      const go = async (input: Record<string, unknown>) => {
        const r = own.start('lab-64', { input });
        await own.waitFor(r.runId);
        const res = own.events(r.runId).find((e) => e.type === 'result');
        return res?.type === 'result' ? res : undefined;
      };
      expect((await go({ ...base, resetAudit: true }))?.validation?.passed).toBe(true);
      const file = join(services.files('lab-64-audit'), 'audit.jsonl');
      writeFileSync(file, readFileSync(file, 'utf8').replace('"executed"', '"not-invoked"'));
      const tampered = await go(base);
      expect(tampered?.validation?.checks.find((c) => c.id === 'audit-chain-intact')?.passed).toBe(false);
      expect((await go({ ...base, resetAudit: true }))?.validation?.passed).toBe(true);
    } finally {
      await own.dispose();
    }
  });

  it('rejects a fail-open policy before running', () => {
    expect(Lab64InputSchema.safeParse({ ...base, policy: { ...DEFAULT_POLICY, default: 'allow' } }).success).toBe(false);
    expect(Lab64InputSchema.safeParse({ ...base, request: 'x'.repeat(501) }).success).toBe(false);
  });
});
