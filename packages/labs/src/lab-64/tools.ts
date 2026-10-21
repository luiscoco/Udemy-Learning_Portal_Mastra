import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { argsHashOf, mask, type AuditFields, type AuditLog } from './audit.js';
import { evaluate, type Approver, type Policy, type Role, type ToolName } from './policy.js';

/** Sandbox accounts and orders. Amounts are euro cents. */
export const ACCOUNTS: Record<string, { email: string; status: 'active' | 'closed' }> = {
  'CUS-1042': { email: 'jordan@customer.example', status: 'active' },
  'CUS-2001': { email: 'riley@customer.example', status: 'active' },
};
export const ORDERS: Record<string, { customerId: string; paidCents: number }> = {
  'ORD-3001': { customerId: 'CUS-1042', paidCents: 4_500 },
  'ORD-3002': { customerId: 'CUS-1042', paidCents: 24_000 },
  'ORD-3003': { customerId: 'CUS-2001', paidCents: 99_000 },
};

/** In-memory side-effect sinks, rebuilt per run from the sandbox data. */
export class Sinks {
  readonly accounts = structuredClone(ACCOUNTS);
  readonly refunds: { orderId: string; amountCents: number }[] = [];
  readonly emailChanges: { customerId: string; from: string; to: string }[] = [];
  readonly closed: string[] = [];
}

/** How many times each tool really executed. Denied calls must leave these at zero. */
export type Counters = Record<ToolName, number>;
export const zeroCounters = (): Counters => ({ lookupAccount: 0, issueRefund: 0, changeEmail: 0, closeAccount: 0 });

/** Approvals granted by an eligible human, bound to one tool call and its exact arguments. */
export type ApprovalBook = Map<string, { argsHash: string; approver: Approver }>;

export interface OpsToolOptions {
  runId: string;
  actor: string;
  role: Role;
  policy: Policy;
  audit: AuditLog;
  approvals: ApprovalBook;
  sinks: Sinks;
  counters: Counters;
}

type Result = { ok: true; detail: string } | { ok: false; code: string; message: string };
const ResultSchema = z.union([
  z.object({ ok: z.literal(true), detail: z.string() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
const CUSTOMER = z.string().regex(/^CUS-\d{4}$/);

/**
 * Account tools with the policy enforced through Mastra's native approval hooks:
 * - requireApproval: every call that is not `allow` goes to the approval gate;
 * - beforeApproval: `deny` calls are rejected there, so they never execute and no human sees them;
 * - execute: re-evaluates the policy (beforeApproval does not run on resume) and, for `confirm`, requires
 *   an approval bound to this toolCallId and these exact arguments.
 */
export function createOpsTools(o: OpsToolOptions) {
  const log = (
    toolName: ToolName,
    toolCallId: string,
    args: unknown,
    stage: AuditFields['stage'],
    decision: string,
    reason: string,
    ruleId?: string,
  ) =>
    o.audit.append({
      runId: o.runId,
      actor: o.actor,
      role: o.role,
      toolName,
      toolCallId,
      argsHash: argsHashOf(args),
      args: mask(args),
      stage,
      decision,
      reason,
      ...(ruleId ? { ruleId } : {}),
    });

  function gated<I extends Record<string, unknown>>(toolName: ToolName, perform: (args: I) => Result) {
    return {
      requireApproval: (input: I) => evaluate(o.policy, { role: o.role, toolName, args: input }).effect !== 'allow',
      beforeApproval: async (input: I, ctx: { toolCallId: string }) => {
        const d = evaluate(o.policy, { role: o.role, toolName, args: input });
        await log(toolName, ctx.toolCallId, input, 'policy', d.effect, d.reason, d.ruleId);
        if (d.effect !== 'deny') return;
        await log(toolName, ctx.toolCallId, input, 'execution', 'not-invoked', 'denied by policy before execution');
        return { proceed: false as const, output: { ok: false, code: 'DENIED_BY_POLICY', message: d.reason } satisfies Result };
      },
      execute: async (input: I, context: { agent?: { toolCallId: string } }): Promise<Result> => {
        const toolCallId = context?.agent?.toolCallId ?? 'unknown';
        const d = evaluate(o.policy, { role: o.role, toolName, args: input });
        if (d.effect === 'allow') await log(toolName, toolCallId, input, 'policy', 'allow', d.reason, d.ruleId);
        const refuse = async (code: string, message: string) => {
          await log(toolName, toolCallId, input, 'execution', 'not-invoked', message, d.ruleId);
          return { ok: false as const, code, message };
        };
        if (d.effect === 'deny') return refuse('DENIED_BY_POLICY', d.reason); // defence in depth
        if (d.effect === 'confirm') {
          const approval = o.approvals.get(toolCallId);
          if (!approval) return refuse('NOT_APPROVED', 'no eligible approval recorded for this call');
          if (approval.argsHash !== argsHashOf(input))
            return refuse('APPROVAL_MISMATCH', 'the arguments differ from the approved call');
        }
        const result = perform(input);
        if (result.ok) o.counters[toolName] += 1;
        await log(
          toolName,
          toolCallId,
          input,
          'execution',
          result.ok ? 'executed' : 'failed',
          result.ok ? result.detail : result.message,
          d.ruleId,
        );
        return result;
      },
    };
  }

  const s = o.sinks;
  return {
    lookupAccount: createTool({
      id: 'lookupAccount',
      description: 'Read-only: shows the status of a customer account (CUS-1234).',
      inputSchema: z.object({ customerId: CUSTOMER }),
      outputSchema: ResultSchema,
      ...gated<{ customerId: string }>('lookupAccount', ({ customerId }) => {
        const a = s.accounts[customerId];
        return a
          ? { ok: true, detail: `${customerId} is ${a.status}` }
          : { ok: false, code: 'UNKNOWN', message: `${customerId} not found` };
      }),
    }),
    issueRefund: createTool({
      id: 'issueRefund',
      description: 'Side effect: refunds an order (ORD-1234). Amount in euro cents.',
      inputSchema: z.object({
        orderId: z.string().regex(/^ORD-\d{4}$/),
        amountCents: z.number().int().positive().max(10_000_000),
      }),
      outputSchema: ResultSchema,
      ...gated<{ orderId: string; amountCents: number }>('issueRefund', ({ orderId, amountCents }) => {
        const order = ORDERS[orderId];
        if (!order) return { ok: false, code: 'UNKNOWN', message: `${orderId} not found` };
        if (amountCents > order.paidCents)
          return { ok: false, code: 'OVER_PAID', message: `${orderId} was paid ${order.paidCents} cents` };
        if (s.refunds.some((r) => r.orderId === orderId))
          return { ok: false, code: 'DUPLICATE', message: `${orderId} was already refunded` };
        s.refunds.push({ orderId, amountCents });
        return { ok: true, detail: `refunded ${amountCents} cents on ${orderId}` };
      }),
    }),
    changeEmail: createTool({
      id: 'changeEmail',
      description: 'Side effect: changes the login email of a customer account.',
      inputSchema: z.object({ customerId: CUSTOMER, newEmail: z.string().trim().toLowerCase().email().max(120) }),
      outputSchema: ResultSchema,
      ...gated<{ customerId: string; newEmail: string }>('changeEmail', ({ customerId, newEmail }) => {
        const a = s.accounts[customerId];
        if (!a) return { ok: false, code: 'UNKNOWN', message: `${customerId} not found` };
        s.emailChanges.push({ customerId, from: a.email, to: newEmail });
        a.email = newEmail;
        return { ok: true, detail: `changed the email of ${customerId}` };
      }),
    }),
    closeAccount: createTool({
      id: 'closeAccount',
      description: 'Destructive side effect: closes a customer account.',
      inputSchema: z.object({ customerId: CUSTOMER }),
      outputSchema: ResultSchema,
      ...gated<{ customerId: string }>('closeAccount', ({ customerId }) => {
        const a = s.accounts[customerId];
        if (!a) return { ok: false, code: 'UNKNOWN', message: `${customerId} not found` };
        if (a.status === 'closed') return { ok: false, code: 'ALREADY_CLOSED', message: `${customerId} is already closed` };
        a.status = 'closed';
        s.closed.push(customerId);
        return { ok: true, detail: `closed ${customerId}` };
      }),
    }),
  };
}
