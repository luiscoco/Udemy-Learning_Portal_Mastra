import { z } from 'zod';

export const ROLES = ['viewer', 'support-agent', 'supervisor'] as const;
export type Role = (typeof ROLES)[number];
export const APPROVER_ROLES = ['team-lead', 'manager'] as const;
/** Who confirms: a separate human with a role, or `self` (the requester, never eligible). */
export const APPROVERS = ['self', ...APPROVER_ROLES] as const;
export type Approver = (typeof APPROVERS)[number];
export const TOOLS = ['lookupAccount', 'issueRefund', 'changeEmail', 'closeAccount'] as const;
export type ToolName = (typeof TOOLS)[number];

const RuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    tools: z.array(z.enum(TOOLS)).min(1).max(TOOLS.length),
    roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
    when: z
      .object({ maxAmountCents: z.number().int().nonnegative().max(10_000_000).optional() })
      .strict()
      .optional(),
    effect: z.enum(['allow', 'confirm', 'deny']),
    approverRoles: z.array(z.enum(APPROVER_ROLES)).min(1).max(APPROVER_ROLES.length).optional(),
  })
  .strict()
  .refine((r) => r.effect !== 'confirm' || r.approverRoles, { message: 'confirm rules must name approverRoles' });

export const PolicySchema = z
  .object({
    /** Fail closed: a call that matches no rule is denied. A policy that defaults to allow is rejected. */
    default: z.literal('deny'),
    rules: z.array(RuleSchema).max(30),
  })
  .strict()
  .refine((p) => new Set(p.rules.map((r) => r.id)).size === p.rules.length, { message: 'rule ids must be unique' });
export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = {
  default: 'deny',
  rules: [
    { id: 'read-accounts', tools: ['lookupAccount'], roles: ['viewer', 'support-agent', 'supervisor'], effect: 'allow' },
    {
      id: 'small-refund',
      tools: ['issueRefund'],
      roles: ['support-agent', 'supervisor'],
      when: { maxAmountCents: 5_000 },
      effect: 'allow',
    },
    {
      id: 'large-refund',
      tools: ['issueRefund'],
      roles: ['support-agent', 'supervisor'],
      when: { maxAmountCents: 50_000 },
      effect: 'confirm',
      approverRoles: ['team-lead', 'manager'],
    },
    {
      id: 'change-email',
      tools: ['changeEmail'],
      roles: ['support-agent', 'supervisor'],
      effect: 'confirm',
      approverRoles: ['team-lead', 'manager'],
    },
    { id: 'close-account', tools: ['closeAccount'], roles: ['supervisor'], effect: 'confirm', approverRoles: ['manager'] },
  ],
};

export interface PolicyDecision {
  effect: 'allow' | 'confirm' | 'deny';
  /** The rule that decided, or `default` when none matched. */
  ruleId: string;
  reason: string;
  approverRoles: string[];
}

/** First matching rule wins; no match means the default (deny). Pure and deterministic. */
export function evaluate(policy: Policy, call: { role: Role; toolName: string; args: unknown }): PolicyDecision {
  const amount = (call.args as { amountCents?: unknown } | undefined)?.amountCents;
  for (const rule of policy.rules) {
    if (!(rule.tools as string[]).includes(call.toolName) || !rule.roles.includes(call.role)) continue;
    const max = rule.when?.maxAmountCents;
    if (max !== undefined && !(typeof amount === 'number' && amount <= max)) continue;
    return {
      effect: rule.effect,
      ruleId: rule.id,
      reason: `rule ${rule.id}: ${rule.effect} ${call.toolName} for ${call.role}${max !== undefined ? ` up to ${max} cents` : ''}`,
      approverRoles: rule.approverRoles ?? [],
    };
  }
  return {
    effect: 'deny',
    ruleId: 'default',
    reason: `no rule lets ${call.role} call ${call.toolName}: denied by default`,
    approverRoles: [],
  };
}

/** Separation of duties: the approver needs one of the rule's roles and is never the requester. */
export function eligibleApprover(decision: PolicyDecision, approver: Approver): { ok: boolean; reason: string } {
  if (approver === 'self') return { ok: false, reason: 'the requester cannot approve their own action' };
  if (!decision.approverRoles.includes(approver))
    return {
      ok: false,
      reason: `${approver} may not approve rule ${decision.ruleId} (needs ${decision.approverRoles.join(' or ')})`,
    };
  return { ok: true, reason: `${approver} is an eligible approver for rule ${decision.ruleId}` };
}
