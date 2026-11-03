import { join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { consumeStream, streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { argsHashOf, AuditLog, mask, type AuditEntry } from './audit.js';
import { lab64Definition } from './definition.js';
import { APPROVERS, eligibleApprover, evaluate, PolicySchema, ROLES, type Policy, type Role } from './policy.js';
import { createOpsTools, Sinks, zeroCounters, type ApprovalBook, type Counters } from './tools.js';

export const MAX_STEPS = 4;
/** Bound on human decisions per run. */
export const MAX_APPROVAL_ROUNDS = 6;
const AUDIT_STORE = 'lab-64-audit';

export const Lab64InputSchema = z.object({
  request: z.string().trim().min(3).max(500),
  role: z.enum(ROLES),
  approver: z.enum(APPROVERS),
  userDecision: z.enum(['approve', 'decline', 'ask']),
  policy: PolicySchema,
  resetAudit: z.boolean().default(false),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab64Input = z.infer<typeof Lab64InputSchema>;

export interface CallDecision {
  toolCallId: string;
  toolName: string;
  args: unknown;
  ruleId: string;
  effect: 'allow' | 'confirm' | 'deny';
  approval?: { approver: string; decision: 'approved' | 'declined'; reason: string };
  outcome: 'executed' | 'failed' | 'not-invoked' | 'unknown';
}

export interface Lab64Output {
  role: Role;
  approver: Lab64Input['approver'];
  answer: string;
  decisions: CallDecision[];
  counters: Counters;
  sideEffects: { refunds: Sinks['refunds']; emailChanges: unknown[]; closed: string[] };
  toolCalls: ToolTrace[];
  audit: {
    file: string;
    /** Why the log was rotated before this run: on request, legacy (unkeyed) format, or retention. */
    rotated: 'reset' | 'legacy' | 'retention' | null;
    before: { valid: boolean; entries: number; brokenAt?: number };
    after: { valid: boolean; entries: number; brokenAt?: number };
    thisRun: AuditEntry[];
  };
  policyDefault: Policy['default'];
}

export const instructionsFor = (role: Role) =>
  `You are an operations assistant acting for an operator with the role "${role}". ` +
  'Carry out each action the operator asks for by calling the matching tool once, with the exact ids and amounts (euro amounts become cents). ' +
  'The platform enforces the approval policy: some calls are denied or need a human to confirm them; never try to work around a denial. ' +
  'Finally report, for each action, whether it was done, denied or declined, exactly as the tools returned.';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** The intended tool calls in an operator request (offline model and tests). */
export function parseRequest(request: string): { toolName: string; input: Record<string, unknown> }[] {
  const calls: { toolName: string; input: Record<string, unknown> }[] = [];
  for (const m of request.matchAll(/look ?up\s+(?:account\s+)?(CUS-\d{4})/gi))
    calls.push({ toolName: 'lookupAccount', input: { customerId: m[1]!.toUpperCase() } });
  if (/refund/i.test(request))
    for (const m of request.matchAll(/(ORD-\d{4})\D{0,12}?(\d+(?:[.,]\d{1,2})?)/gi))
      calls.push({
        toolName: 'issueRefund',
        input: { orderId: m[1]!.toUpperCase(), amountCents: Math.round(Number(m[2]!.replace(',', '.')) * 100) },
      });
  for (const part of request.split(/[,;]|\band\b/i)) {
    const customerId = part.toUpperCase().match(/CUS-\d{4}/)?.[0];
    const email = EMAIL.exec(part)?.[0];
    if (customerId && email && /e-?mail/i.test(part))
      calls.push({ toolName: 'changeEmail', input: { customerId, newEmail: email.toLowerCase() } });
  }
  for (const m of request.matchAll(/close\s+(?:the\s+)?(?:account\s+)?(CUS-\d{4})/gi))
    calls.push({ toolName: 'closeAccount', input: { customerId: m[1]!.toUpperCase() } });
  return calls.slice(0, 8);
}

/** Offline operator model: issues every requested call in one turn, then reports what the tools returned. */
export function operatorScript(request: string) {
  return (v: PromptView): ScriptedTurn => {
    if (v.toolResults.length === 0) {
      const calls = parseRequest(request);
      return calls.length ? { toolCalls: calls } : { text: 'I could not find an action to perform in that request.' };
    }
    return {
      text: v.toolResults
        .map((r) => {
          const out = r.output as { ok?: boolean; detail?: string; message?: string } | undefined;
          return `${r.toolName}: ${out?.ok ? `done (${out.detail})` : `not done (${out?.message ?? 'declined by the approver'})`}`;
        })
        .join('\n'),
    };
  };
}

function decisionsOf(entries: AuditEntry[], traces: ToolTrace[]): CallDecision[] {
  const ids = [...new Set([...traces.map((t) => t.toolCallId), ...entries.map((e) => e.toolCallId)])].filter(
    (id) => id && id !== 'unknown',
  );
  return ids.map((id) => {
    const mine = entries.filter((e) => e.toolCallId === id);
    const policy = mine.find((e) => e.stage === 'policy');
    const approval = mine.find((e) => e.stage === 'approval');
    const exec = mine.filter((e) => e.stage === 'execution').at(-1);
    const trace = traces.find((t) => t.toolCallId === id);
    return {
      toolCallId: id,
      toolName: policy?.toolName ?? trace?.toolName ?? '?',
      args: policy?.args ?? mask(trace?.args),
      ruleId: policy?.ruleId ?? '?',
      effect: (policy?.decision as CallDecision['effect']) ?? 'deny',
      ...(approval
        ? {
            approval: {
              approver: approval.actor,
              decision: approval.decision as 'approved' | 'declined',
              reason: approval.reason,
            },
          }
        : {}),
      outcome: (exec?.decision as CallDecision['outcome']) ?? 'unknown',
    };
  });
}

export const lab64: LabImplementation<Lab64Input, Lab64Output, LabServices> = {
  definition: lab64Definition as LabDefinition,
  inputSchema: Lab64InputSchema,

  async run(ctx, input) {
    const file = join(ctx.services.files(AUDIT_STORE), 'audit.jsonl');
    const audit = new AuditLog(file, { key: ctx.services.auditKey() });
    const rotated: Lab64Output['audit']['rotated'] = input.resetAudit
      ? (await audit.rotate())
        ? 'reset'
        : null
      : await audit.prepare();
    if (rotated === 'legacy')
      ctx.log('warn', 'An unkeyed audit log from an older version was archived: it can never be trusted.');
    if (rotated === 'retention') ctx.log('info', 'The audit log reached its size limit and was rotated; the old file is kept.');
    const before = audit.verify();
    if (!before.valid)
      ctx.log(
        'warn',
        `The stored audit log is broken at entry ${before.brokenAt} (${before.reason}): it was modified outside the platform.`,
      );

    const actor = `operator (${input.role})`;
    const approvals: ApprovalBook = new Map();
    const counters = zeroCounters();
    const sinks = new Sinks();
    const tools = createOpsTools({
      runId: ctx.runId,
      actor,
      role: input.role,
      policy: input.policy,
      audit,
      approvals,
      sinks,
      counters,
    });
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: operatorScript(input.request),
    });
    // Registered on a Mastra instance so suspended approval calls can be resumed from its run snapshot.
    const mastra = new Mastra({
      agents: {
        ops: new Agent({
          id: 'lab64-ops',
          name: 'Operations assistant',
          instructions: instructionsFor(input.role),
          model: resolved.model,
          tools,
        }),
      },
    });
    const agent = withLabLogger(ctx, mastra.getAgent('ops'));

    ctx.emit({ type: 'workflow-step', stepId: 'agent', status: 'running', input: { role: input.role } });
    const startedAt = new Map<string, number>();
    const entry = (
      t: { toolName: string; toolCallId: string; args: unknown },
      stage: 'policy' | 'execution',
      decision: string,
      reason: string,
      ruleId: string,
    ) =>
      audit.append({
        runId: ctx.runId,
        actor,
        role: input.role,
        toolName: t.toolName,
        toolCallId: t.toolCallId,
        argsHash: argsHashOf(t.args),
        args: mask(t.args),
        stage,
        decision,
        ruleId,
        reason,
      });
    /** Calls Mastra rejected before any hook ran (input failed the tool schema) still get audited. */
    const auditUnaudited = async (traces: ToolTrace[]) => {
      // Such a call can even reach the approval gate first: Mastra validates the input again on resume.
      const mine = audit.read().filter((e) => e.runId === ctx.runId);
      const has = (id: string, stage: string) => mine.some((e) => e.toolCallId === id && e.stage === stage);
      for (const t of traces) {
        if (t.status !== 'invalid' && t.status !== 'error') continue;
        const why = t.error ?? (t.status === 'invalid' ? 'arguments failed the tool schema' : `tool call ended as ${t.status}`);
        if (!has(t.toolCallId, 'policy'))
          await entry(t, 'policy', 'deny', `rejected by Mastra before the policy ran: ${why}`, 'input-validation');
        if (!has(t.toolCallId, 'execution'))
          await entry(t, 'execution', 'not-invoked', `the tool never ran: ${why}`, 'input-validation');
      }
    };

    let res = await streamAgent(ctx, agent, input.request, { maxSteps: MAX_STEPS, startedAt });
    const toolCalls = [...res.tools];
    await auditUnaudited(res.tools);
    let answer = res.text;

    // Every pending call ends approved or declined; beyond MAX_APPROVAL_ROUNDS the rest are declined.
    for (let round = 0; res.pendingApprovals.length > 0 && round < MAX_APPROVAL_ROUNDS + 8; round++) {
      const pending = res.pendingApprovals[0]!;
      const d = evaluate(input.policy, { role: input.role, toolName: pending.toolName, args: pending.args });
      const eligible = eligibleApprover(d, input.approver);
      let decision: 'approved' | 'declined';
      let reason: string;
      let by: string = input.approver;
      if (round >= MAX_APPROVAL_ROUNDS) {
        decision = 'declined';
        reason = `approval round limit reached (${MAX_APPROVAL_ROUNDS} decisions per run)`;
        by = 'system (approval round limit)';
        ctx.log('warn', `Declined ${pending.toolName}: ${reason}.`);
      } else if (!eligible.ok) {
        decision = 'declined';
        reason = `separation of duties: ${eligible.reason}`;
        by = `system (on behalf of ${input.approver})`;
        ctx.log('warn', `Approval refused without asking: ${eligible.reason}.`);
      } else if (input.userDecision === 'ask') {
        ctx.log('info', `Waiting for you to decide as ${input.approver} in the Run tab (the run deadline is paused).`);
        const o = await ctx.requestApproval({
          toolName: pending.toolName,
          args: mask(pending.args),
          message: `${d.reason}. You approve as ${input.approver}.`,
        });
        decision = o.decision === 'approve' ? 'approved' : 'declined';
        reason = o.by === 'user' ? `${input.approver} decided in the Run tab` : `auto-declined (${o.by})`;
      } else {
        decision = input.userDecision === 'approve' ? 'approved' : 'declined';
        reason = `${input.approver} decision preset in the lab input`;
      }
      if (decision === 'approved')
        approvals.set(pending.toolCallId, { argsHash: argsHashOf(pending.args), approver: input.approver });
      await audit.append({
        runId: ctx.runId,
        actor: by,
        role: input.role,
        toolName: pending.toolName,
        toolCallId: pending.toolCallId,
        argsHash: argsHashOf(pending.args),
        args: mask(pending.args),
        stage: 'approval',
        decision,
        ruleId: d.ruleId,
        reason,
      });
      if (decision === 'declined')
        await audit.append({
          runId: ctx.runId,
          actor,
          role: input.role,
          toolName: pending.toolName,
          toolCallId: pending.toolCallId,
          argsHash: argsHashOf(pending.args),
          args: mask(pending.args),
          stage: 'execution',
          decision: 'not-invoked',
          ruleId: d.ruleId,
          reason: 'declined, so the tool never ran',
        });
      ctx.emit({ type: 'workflow-step', stepId: `approval ${pending.toolName}`, status: 'success', output: { decision, by } });
      const options = { runId: res.runId!, toolCallId: pending.toolCallId, abortSignal: ctx.signal, maxSteps: MAX_STEPS };
      const resumed =
        decision === 'approved'
          ? await agent.approveToolCall(options)
          : await agent.declineToolCall({ ...options, reason: 'The approver declined this action.' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await consumeStream(ctx, resumed as any, { startedAt });
      toolCalls.push(...res.tools);
      await auditUnaudited(res.tools);
      answer += res.text;
    }
    ctx.emit({ type: 'workflow-step', stepId: 'agent', status: 'success', output: { toolCalls: toolCalls.length } });

    const thisRun = audit.read().filter((e) => e.runId === ctx.runId);
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, role: input.role },
    });
    return {
      role: input.role,
      approver: input.approver,
      answer: answer.trim(),
      decisions: decisionsOf(thisRun, toolCalls),
      counters,
      sideEffects: {
        refunds: [...sinks.refunds],
        emailChanges: mask(sinks.emailChanges) as unknown[],
        closed: [...sinks.closed],
      },
      toolCalls: toolCalls.map((t) => ({ ...t, args: mask(t.args) })),
      audit: { file: `${AUDIT_STORE}/audit.jsonl`, rotated, before, after: audit.verify(), thisRun },
      policyDefault: input.policy.default,
    };
  },

  validate(out, input) {
    const entries = out.audit.thisRun;
    const executed = entries.filter((e) => e.stage === 'execution' && e.decision === 'executed');
    const blocked = out.decisions.filter((d) => d.effect === 'deny' || d.approval?.decision === 'declined');
    const invoked = Object.values(out.counters).reduce((a, b) => a + b, 0);
    const approved = entries.filter((e) => e.stage === 'approval' && e.decision === 'approved');
    return summarizeChecks([
      {
        id: 'denied-never-invoked',
        label: 'Denied and declined actions were never invoked',
        passed: blocked.every((d) => d.outcome === 'not-invoked') && invoked === executed.length,
        message: `${blocked.length} blocked, ${invoked} tool execution(s), ${executed.length} executed audit entr${executed.length === 1 ? 'y' : 'ies'}`,
      },
      {
        id: 'confirmed-before-execute',
        label: 'Every action that needed confirmation ran only after an approval of the exact same call',
        passed: out.decisions
          .filter((d) => d.effect === 'confirm' && d.outcome === 'executed')
          .every((d) => {
            const exec = executed.find((e) => e.toolCallId === d.toolCallId);
            return approved.some(
              (a) => a.toolCallId === d.toolCallId && a.argsHash === exec?.argsHash && a.seq < (exec?.seq ?? 0),
            );
          }),
        message: `${approved.length} approval(s) recorded`,
      },
      {
        id: 'separation-of-duties',
        label: 'No one approved their own action or a rule they are not allowed to approve',
        passed: approved.every((a) => {
          const rule = input.policy.rules.find((r) => r.id === a.ruleId);
          return a.actor !== 'self' && (rule?.approverRoles ?? []).includes(a.actor as never);
        }),
        message:
          input.approver === 'self'
            ? 'self-approval requested: every confirmation was refused'
            : `approver ${input.approver}: ${approved.length} approval(s) accepted`,
      },
      {
        id: 'policy-fail-closed',
        label: 'Every call got a policy decision; calls matching no rule were denied',
        passed:
          out.policyDefault === 'deny' &&
          out.decisions.length > 0 &&
          out.decisions.every((d) => d.ruleId !== '?' && (d.ruleId !== 'default' || d.effect === 'deny')),
        message: out.decisions.map((d) => `${d.toolName}: ${d.ruleId} → ${d.effect}`).join('; '),
      },
      {
        id: 'audit-complete',
        label: 'The audit log has a decision and an outcome for every tool call',
        passed:
          out.toolCalls.every((t) => entries.some((e) => e.toolCallId === t.toolCallId && e.stage === 'policy')) &&
          out.decisions.every((d) => d.outcome !== 'unknown'),
        message: `${entries.length} audit entries in this run`,
      },
      {
        id: 'audit-chain-intact',
        label: 'The stored audit log verifies: no entry was changed, removed or reordered',
        passed: out.audit.after.valid,
        message: out.audit.after.valid
          ? `${out.audit.after.entries} chained entries verified`
          : `chain broken at entry ${out.audit.after.brokenAt}; tick "Start a new audit log" to rotate it`,
      },
    ]);
  },
};
