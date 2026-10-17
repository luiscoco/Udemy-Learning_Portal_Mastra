import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

/** Mock orders (deterministic). Amounts are euro cents. */
export const ORDERS: Record<string, { item: string; paidCents: number; customerId: string }> = {
  'ORD-1001': { item: 'Ceramic mug', paidCents: 4500, customerId: 'CUS-0001' },
  'ORD-1002': { item: 'Espresso machine', paidCents: 45_000, customerId: 'CUS-0002' },
  'ORD-1003': { item: 'Tea towel set', paidCents: 1800, customerId: 'CUS-0001' },
};

export const ROLES = ['support-agent', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Role-based tool allowlist. Tools a role is not allowed to use are never given to the agent. */
export const ROLE_TOOLS: Record<Role, readonly string[]> = {
  'support-agent': ['lookupOrder', 'issueRefund'],
  viewer: ['lookupOrder'],
};

/** Policy limit enforced inside execute(): even an approved refund above it is denied. */
export const REFUND_LIMIT_CENTS = 20_000;

export const eur = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export type AuditDecision = 'blocked' | 'approval-requested' | 'approved' | 'declined' | 'executed' | 'denied-by-policy' | 'read';

export interface AuditEntry {
  seq: number;
  toolName: string;
  toolCallId?: string;
  args: unknown;
  decision: AuditDecision;
  reason: string;
  actor: string;
}

/** Append-only audit trail: entries can be added and read, never changed or removed. */
export class AuditTrail {
  readonly #entries: AuditEntry[] = [];
  constructor(private readonly onAppend?: (e: AuditEntry) => void) {}
  append(entry: Omit<AuditEntry, 'seq'>): AuditEntry {
    const e = Object.freeze({ seq: this.#entries.length + 1, ...entry });
    this.#entries.push(e);
    this.onAppend?.(e);
    return e;
  }
  get entries(): readonly AuditEntry[] {
    return [...this.#entries];
  }
}

export interface LedgerEntry {
  refundId: string;
  orderId: string;
  amountCents: number;
}

/** Mock payments ledger: the side effect. One refund per order (idempotent by orderId). */
export class RefundLedger {
  readonly entries: LedgerEntry[] = [];
  /** How many times issueRefund.execute() was invoked (only approved calls reach it). */
  executeCount = 0;
}

const RefundResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), refundId: z.string(), orderId: z.string(), amountCents: z.number().int() }),
  z.object({
    ok: z.literal(false),
    code: z.enum(['UNKNOWN_ORDER', 'OVER_LIMIT', 'OVER_PAID', 'ALREADY_REFUNDED', 'ROLE_NOT_ALLOWED']),
    message: z.string(),
  }),
]);
export type RefundResult = z.infer<typeof RefundResult>;

/** Pure policy check: every rule that applies even after a human approved the call. */
export function checkRefundPolicy(
  role: Role,
  args: { orderId: string; amountCents: number },
  ledger: RefundLedger,
): Extract<RefundResult, { ok: false }> | null {
  if (!ROLE_TOOLS[role].includes('issueRefund'))
    return { ok: false, code: 'ROLE_NOT_ALLOWED', message: `Role ${role} may not issue refunds.` };
  const order = ORDERS[args.orderId];
  if (!order) return { ok: false, code: 'UNKNOWN_ORDER', message: `Order ${args.orderId} does not exist.` };
  if (args.amountCents > REFUND_LIMIT_CENTS)
    return {
      ok: false,
      code: 'OVER_LIMIT',
      message: `Refunds above ${eur(REFUND_LIMIT_CENTS)} need a manager; ${eur(args.amountCents)} was requested.`,
    };
  if (args.amountCents > order.paidCents)
    return { ok: false, code: 'OVER_PAID', message: `Order ${args.orderId} was only ${eur(order.paidCents)}.` };
  if (ledger.entries.some((e) => e.orderId === args.orderId))
    return { ok: false, code: 'ALREADY_REFUNDED', message: `Order ${args.orderId} was already refunded.` };
  return null;
}

export function createSupportTools(opts: { role: Role; actor: string; audit: AuditTrail; ledger: RefundLedger }) {
  const { role, actor, audit, ledger } = opts;

  const lookupOrder = createTool({
    id: 'lookup-order',
    description: 'Read-only: looks up an order by id (format ORD-1234) and returns the item and the amount paid in euro cents.',
    inputSchema: z.object({ orderId: z.string().regex(/^ORD-\d{4}$/) }),
    outputSchema: z.object({
      found: z.boolean(),
      orderId: z.string(),
      item: z.string().optional(),
      paidCents: z.number().int().optional(),
    }),
    execute: async ({ orderId }) => {
      audit.append({ toolName: 'lookupOrder', args: { orderId }, decision: 'read', reason: 'read-only tool', actor });
      const o = ORDERS[orderId];
      return o ? { found: true, orderId, item: o.item, paidCents: o.paidCents } : { found: false, orderId };
    },
  });

  const issueRefund = createTool({
    id: 'issue-refund',
    description:
      'Side effect: refunds part or all of an order to the customer. Amount in euro cents. A human must approve each call.',
    inputSchema: z.object({
      orderId: z.string().regex(/^ORD-\d{4}$/),
      amountCents: z.number().int().positive(),
      reason: z.string().min(3).max(200),
    }),
    outputSchema: RefundResult,
    // Native Mastra approval: the stream suspends with a tool-call-approval chunk until
    // agent.approveToolCall() or agent.declineToolCall() resumes it.
    requireApproval: true,
    execute: async (args) => {
      // Defence in depth: approval is necessary, not sufficient. Policy is checked here, at execution time.
      ledger.executeCount += 1;
      const denial = checkRefundPolicy(role, args, ledger);
      if (denial) {
        audit.append({ toolName: 'issueRefund', args, decision: 'denied-by-policy', reason: denial.code, actor });
        return denial;
      }
      const refundId = `RF-${String(ledger.entries.length + 1).padStart(4, '0')}`;
      ledger.entries.push({ refundId, orderId: args.orderId, amountCents: args.amountCents });
      audit.append({ toolName: 'issueRefund', args, decision: 'executed', reason: refundId, actor });
      return { ok: true as const, refundId, orderId: args.orderId, amountCents: args.amountCents };
    },
  });

  const all = { lookupOrder, issueRefund };
  // Only the tools on the role's allowlist are handed to the agent.
  return Object.fromEntries(Object.entries(all).filter(([name]) => ROLE_TOOLS[role].includes(name))) as Partial<typeof all>;
}
