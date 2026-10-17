import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { consumeStream, streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab15Definition } from './definition.js';
import {
  AuditTrail,
  createSupportTools,
  eur,
  RefundLedger,
  ROLE_TOOLS,
  ROLES,
  type AuditEntry,
  type LedgerEntry,
  type RefundResult,
} from './policy.js';

export const INSTRUCTIONS =
  'You are a support assistant for an online shop. Use lookupOrder to check an order. ' +
  'When the customer asks for a refund, call issueRefund with the order id, the amount in euro cents and a short reason; ' +
  'a human approval step and a policy check are handled by the system, so do not ask for confirmation yourself. ' +
  'Only use the tools you were given. Report exactly what the tools returned and never claim a refund that was not issued.';

/** Safety bound on approval rounds per run (each round = one human decision). */
const MAX_APPROVAL_ROUNDS = 3;

export const Lab15InputSchema = z.object({
  request: z.string().trim().min(1).max(500),
  role: z.enum(ROLES),
  userDecision: z.enum(['approve', 'decline']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab15Input = z.infer<typeof Lab15InputSchema>;

export interface Lab15Output {
  role: Lab15Input['role'];
  allowedTools: string[];
  answer: string;
  approvals: { toolName: string; args: unknown; decision: 'approved' | 'declined' }[];
  toolCalls: ToolTrace[];
  audit: AuditEntry[];
  ledger: LedgerEntry[];
  refundExecutions: number;
}

/** Extracts the intent the offline model acts on: an order id, a euro amount and the requested action. */
export function parseRequest(text: string) {
  const orderId = text.toUpperCase().match(/\bORD-\d{4}\b/)?.[0] ?? null;
  const amount = text.match(/(?:refund|return)\D{0,12}?(\d+(?:[.,]\d{1,2})?)/i)?.[1];
  const amountCents = amount ? Math.round(Number(amount.replace(',', '.')) * 100) : null;
  const action = /\b(delete|erase|remove)\b/i.test(text)
    ? 'deleteCustomer'
    : /\brefund\b/i.test(text)
      ? 'issueRefund'
      : 'lookupOrder';
  return { orderId, amountCents, action } as const;
}

/**
 * Offline model: looks the order up, then attempts the requested action, whether or not the role allows it,
 * so the lab can show what the platform does with an unauthorized call.
 */
export function offlineScript(request: string) {
  const intent = parseRequest(request);
  return (v: PromptView): ScriptedTurn => {
    const lookup = v.toolResults.find((r) => r.toolName === 'lookupOrder')?.output as
      { found: boolean; paidCents?: number; item?: string } | undefined;
    const attempt = v.toolResults.find((r) => r.toolName === intent.action);
    if (intent.orderId && !lookup) return { toolCalls: [{ toolName: 'lookupOrder', input: { orderId: intent.orderId } }] };
    if (!intent.orderId) return { text: 'Please tell me the order id (format ORD-1234).' };
    if (!lookup?.found) return { text: `I could not find order ${intent.orderId}.` };
    if (intent.action === 'lookupOrder')
      return { text: `${intent.orderId}: ${lookup.item}, paid ${eur(lookup.paidCents ?? 0)}.` };
    if (!attempt) {
      const input =
        intent.action === 'deleteCustomer'
          ? { customerId: 'CUS-0001' }
          : { orderId: intent.orderId, amountCents: intent.amountCents ?? lookup.paidCents, reason: 'Customer request' };
      return { toolCalls: [{ toolName: intent.action, input }] };
    }
    if (!v.toolNames.includes(intent.action))
      return { text: `I can't do that: ${intent.action} is not available to your role. I can only look up orders.` };
    const out = attempt.output as RefundResult | string | undefined;
    if (out && typeof out === 'object' && 'ok' in out)
      return out.ok
        ? { text: `Refund ${out.refundId} of ${eur(out.amountCents)} for ${out.orderId} was issued.` }
        : { text: `The refund was not issued: ${out.message}` };
    return { text: 'The refund was not issued because the approver declined it.' };
  };
}

export const lab15: LabImplementation<Lab15Input, Lab15Output, LabServices> = {
  definition: lab15Definition as LabDefinition,
  inputSchema: Lab15InputSchema,

  async run(ctx, input) {
    const actor = `learner (${input.role})`;
    const audit = new AuditTrail((e) =>
      ctx.log(
        e.decision === 'blocked' || e.decision === 'denied-by-policy' ? 'warn' : 'info',
        `audit #${e.seq} ${e.toolName}: ${e.decision} — ${e.reason}`,
      ),
    );
    const ledger = new RefundLedger();
    const tools = createSupportTools({ role: input.role, actor, audit, ledger });
    const allowedTools = [...ROLE_TOOLS[input.role]];
    ctx.log('info', `Role ${input.role} may use: ${allowedTools.join(', ')}`);

    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.request),
    });
    // Registering the agent on a Mastra instance gives it the run snapshot store that approve/decline resume from.
    const mastra = new Mastra({
      agents: {
        supportAgent: new Agent({
          id: 'support-agent',
          name: 'Support Agent',
          instructions: INSTRUCTIONS,
          model: resolved.model,
          tools,
        }),
      },
    });
    const agent = withLabLogger(ctx, mastra.getAgent('supportAgent'));

    const startedAt = new Map<string, number>();
    const toolCalls: ToolTrace[] = [];
    const approvals: Lab15Output['approvals'] = [];
    const recordBlocked = (traces: ToolTrace[]) => {
      for (const t of traces)
        if (!allowedTools.includes(t.toolName))
          audit.append({
            toolName: t.toolName,
            toolCallId: t.toolCallId,
            args: t.args,
            decision: 'blocked',
            reason: t.error ?? 'not on the role allowlist',
            actor,
          });
    };

    ctx.emit({ type: 'workflow-step', stepId: 'agent', status: 'running', input: { role: input.role } });
    let res = await streamAgent(ctx, agent, input.request, { maxSteps: 4, startedAt });
    toolCalls.push(...res.tools);
    recordBlocked(res.tools);
    let answer = res.text;

    for (let round = 0; res.pendingApprovals.length > 0 && round < MAX_APPROVAL_ROUNDS; round++) {
      const pending = res.pendingApprovals[0]!;
      audit.append({
        toolName: pending.toolName,
        toolCallId: pending.toolCallId,
        args: pending.args,
        decision: 'approval-requested',
        reason: 'requireApproval',
        actor: 'system',
      });
      const decision = input.userDecision === 'approve' ? 'approved' : 'declined';
      approvals.push({ toolName: pending.toolName, args: pending.args, decision });
      audit.append({
        toolName: pending.toolName,
        toolCallId: pending.toolCallId,
        args: pending.args,
        decision,
        reason: 'decision supplied in the lab input',
        actor: 'human approver',
      });
      ctx.emit({ type: 'workflow-step', stepId: `approval-${pending.toolName}`, status: 'success', output: { decision } });
      const options = { runId: res.runId!, toolCallId: pending.toolCallId, abortSignal: ctx.signal, maxSteps: 4 };
      const resumed =
        decision === 'approved'
          ? await agent.approveToolCall(options)
          : await agent.declineToolCall({ ...options, reason: 'The human approver declined this refund.' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await consumeStream(ctx, resumed as any, { startedAt });
      toolCalls.push(...res.tools);
      recordBlocked(res.tools);
      answer += res.text;
    }
    ctx.emit({ type: 'workflow-step', stepId: 'agent', status: 'success', output: { toolCalls: toolCalls.length } });

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, role: input.role },
    });
    return {
      role: input.role,
      allowedTools,
      answer: answer.trim(),
      approvals,
      toolCalls,
      audit: [...audit.entries],
      ledger: [...ledger.entries],
      refundExecutions: ledger.executeCount,
    };
  },

  validate(out) {
    const unauthorized = out.toolCalls.filter((t) => !out.allowedTools.includes(t.toolName));
    const approved = out.approvals.filter((a) => a.decision === 'approved').length;
    const declined = out.approvals.some((a) => a.decision === 'declined');
    const auditedCalls = new Set(out.audit.map((e) => e.toolCallId).filter(Boolean));
    const executed = out.audit.filter((e) => e.decision === 'executed' || e.decision === 'denied-by-policy');
    const orders = out.ledger.map((l) => l.orderId);
    return summarizeChecks([
      {
        id: 'unauthorized-blocked',
        label: 'Tools outside the role allowlist were blocked and never ran',
        passed:
          unauthorized.every((t) => t.status === 'error') &&
          out.audit.filter((e) => e.decision === 'blocked').length === unauthorized.length,
        message: unauthorized.length
          ? unauthorized.map((t) => `${t.toolName} blocked`).join(', ')
          : 'no unauthorized calls attempted',
      },
      {
        id: 'approval-gate',
        label: 'The side-effect tool only ran after a human approved it',
        passed:
          out.refundExecutions <= approved &&
          executed.every((e) => out.audit.some((a) => a.decision === 'approved' && a.seq < e.seq)),
        message: `${out.approvals.length} approval request(s), ${out.refundExecutions} execution(s)`,
      },
      {
        id: 'side-effect-once',
        label: 'Each approved refund changed the ledger at most once',
        passed:
          out.refundExecutions <= approved && out.ledger.length <= out.refundExecutions && new Set(orders).size === orders.length,
        message: `${out.ledger.length} ledger entr${out.ledger.length === 1 ? 'y' : 'ies'}`,
      },
      {
        id: 'decline-respected',
        label: 'A declined call left the ledger untouched',
        passed: !declined || (out.ledger.length === 0 && out.refundExecutions === 0),
        message: declined ? 'declined' : 'no declined calls',
      },
      {
        id: 'audit-complete',
        label: 'Every gated or blocked call has an audit entry',
        passed:
          out.toolCalls.filter((t) => t.toolName !== 'lookupOrder').every((t) => auditedCalls.has(t.toolCallId)) &&
          out.audit.every((e, i) => e.seq === i + 1),
        message: `${out.audit.length} audit entries`,
      },
    ]);
  },
};
