import { z } from 'zod';

export const SPECIALISTS = ['billing', 'technical', 'account'] as const;
export type Specialist = (typeof SPECIALISTS)[number];
export type AgentId = 'triage' | Specialist;

export const PRODUCTS = ['Reports', 'Dashboard', 'API', 'Mobile app'] as const;
export const ACCOUNT_ISSUES = ['locked', 'login', 'two-factor'] as const;

/** Everything triage extracts. The orchestrator keeps it; specialists only ever see a projection. */
export const CaseSchema = z.object({
  customerId: z
    .string()
    .regex(/^C-\d{3,6}$/)
    .nullable(),
  orderId: z
    .string()
    .regex(/^ORD-\d{3,8}$/)
    .nullable(),
  product: z.enum(PRODUCTS).nullable(),
  errorCode: z
    .string()
    .regex(/^E\d{3}$/)
    .nullable(),
  accountIssue: z.enum(ACCOUNT_ISSUES).nullable(),
  summary: z.string().trim().min(5).max(500),
});
export type Case = z.infer<typeof CaseSchema>;

/** The minimum context each specialist receives. */
export const PACKET_FIELDS = {
  billing: ['customerId', 'orderId', 'summary'],
  technical: ['customerId', 'product', 'errorCode', 'summary'],
  account: ['customerId', 'accountIssue', 'summary'],
} as const satisfies Record<Specialist, readonly (keyof Case)[]>;
/** Required at handoff time for every specialist. Domain fields are what a specialist needs to resolve. */
export const REQUIRED_FIELDS = ['customerId', 'summary'] as const;
/** The field each specialist's domain tool needs. */
export const DOMAIN_FIELD: Record<Specialist, keyof Case> = { billing: 'orderId', technical: 'product', account: 'customerId' };

export type Packet = Partial<Record<keyof Case, string | null>>;

const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const PASSWORD = /(password\s*(?:is|:|=)\s*)(\S+)/gi;
/** Removes card numbers and passwords. */
export const redact = (text: string) => text.replace(CARD, '[card]').replace(PASSWORD, '$1[redacted]');
/** The sensitive strings in a message, so checks can prove none of them reached a specialist. */
export function secretsIn(text: string): string[] {
  return [...(text.match(CARD) ?? []), ...[...text.matchAll(PASSWORD)].map((m) => m[2]!.replace(/[.,;!?]$/, ''))];
}

/** Projects the case onto a specialist's packet fields, with the summary redacted and capped. */
export function packetFor(target: Specialist, c: Case): Packet {
  return Object.fromEntries(
    PACKET_FIELDS[target].map((k) => [k, k === 'summary' ? redact(c.summary).slice(0, 240) : (c[k] ?? null)]),
  );
}

const KEYWORDS: Record<Specialist, RegExp[]> = {
  billing: [/\bcharge[sd]?\b/i, /\brefund/i, /\binvoice/i, /\bpayment/i, /\bbilled\b/i, /\bORD-\d+/],
  technical: [/\bcrash/i, /\berror\b/i, /\bE\d{3}\b/, /\bbug\b/i, /\bbroken\b/i, /\bnot working\b/i, /\bexport/i],
  account: [/\blocked\b/i, /\blog ?in\b/i, /\bpassword\b/i, /\b2fa\b/i, /\btwo-factor\b/i, /\bsign in\b/i],
};
/** Deterministic routing oracle: the specialist whose keywords match most (ties in list order). */
export function expectedTarget(text: string): Specialist {
  const score = (s: Specialist) => KEYWORDS[s].filter((r) => r.test(text)).length;
  return SPECIALISTS.reduce((best, s) => (score(s) > score(best) ? s : best), SPECIALISTS[0]);
}

/** Deterministic extraction oracle (the offline triage script and the checks use it). */
export function extractCase(message: string): Case {
  const m = (r: RegExp) => message.match(r)?.[0] ?? null;
  const product =
    (/\breports?\b|\bexport/i.test(message) && 'Reports') ||
    (/\bdashboard\b/i.test(message) && 'Dashboard') ||
    (/\bapi\b/i.test(message) && 'API') ||
    (/\bmobile app\b|\bapp\b/i.test(message) && 'Mobile app') ||
    null;
  const accountIssue =
    (/\blocked\b/i.test(message) && 'locked') ||
    (/\b2fa\b|two-factor|authenticator/i.test(message) && 'two-factor') ||
    (/\blog ?in\b|\bsign in\b/i.test(message) && 'login') ||
    null;
  const target = expectedTarget(message);
  return {
    customerId: m(/\bC-\d{3,6}\b/),
    orderId: m(/\bORD-\d{3,8}\b/),
    product: target === 'technical' ? product : null,
    errorCode: m(/\bE\d{3}\b/),
    accountIssue: target === 'account' ? accountIssue : null,
    summary: redact(message.replace(/^\s*(hi|hello)[,!.]?\s*/i, '').trim()).slice(0, 240),
  };
}

/** Who may hand off to whom: triage to any specialist, a specialist to another specialist. Never back to triage. */
export const ALLOWED: Record<AgentId, readonly Specialist[]> = {
  triage: SPECIALISTS,
  billing: ['technical', 'account'],
  technical: ['billing', 'account'],
  account: ['billing', 'technical'],
};

export type RefusalReason = 'not-allowed' | 'hop-limit' | 'cycle' | 'missing-context';
export type Decision =
  { accepted: true; hop: number; packet: Packet } | { accepted: false; reason: RefusalReason; detail: string };

/** The orchestrator's handoff guard. Checks run in this order: graph, hop limit, cycle, required fields. */
export function decideHandoff(a: {
  from: AgentId;
  to: string;
  visited: readonly Specialist[];
  hops: number;
  maxHops: number;
  case: Case;
}): Decision {
  const to = a.to as Specialist;
  if (!ALLOWED[a.from].includes(to))
    return { accepted: false, reason: 'not-allowed', detail: `${a.from} may not hand off to ${a.to}` };
  if (a.hops + 1 > a.maxHops)
    return { accepted: false, reason: 'hop-limit', detail: `handoff ${a.hops + 1} would exceed the limit of ${a.maxHops}` };
  if (a.visited.includes(to))
    return { accepted: false, reason: 'cycle', detail: `${to} already handled this case (${a.visited.join(' → ')})` };
  const missing = REQUIRED_FIELDS.filter((k) => !a.case[k]);
  if (missing.length) return { accepted: false, reason: 'missing-context', detail: `missing ${missing.join(', ')}` };
  return { accepted: true, hop: a.hops + 1, packet: packetFor(to, a.case) };
}
