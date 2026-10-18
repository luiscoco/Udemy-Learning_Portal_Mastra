/**
 * Fictional two-tenant corpus with tags and effective dates (YYYYMMDD integers; 99991231 = open-ended).
 * One record per document, so every hit maps to exactly one document.
 */
export interface TenantDoc {
  docId: string;
  tenantId: 'acme' | 'globex';
  tags: string[];
  /** Single-valued audience: who may read the document. */
  visibility: 'public' | 'internal';
  effectiveFrom: number;
  effectiveTo: number;
  source: string;
  text: string;
}

export const OPEN_END = 99991231;

export const TENANT_CORPUS: TenantDoc[] = [
  {
    docId: 'acme-refunds-2025',
    tenantId: 'acme',
    tags: ['policy', 'refunds'],
    visibility: 'public',
    effectiveFrom: 20250101,
    effectiveTo: 20251231,
    source: 'acme/refund-policy-2025.md',
    text: 'Acme refund policy (2025). Customers can request a refund within 14 days of delivery. Refunds are paid by bank transfer.',
  },
  {
    docId: 'acme-refunds-2026',
    tenantId: 'acme',
    tags: ['policy', 'refunds'],
    visibility: 'public',
    effectiveFrom: 20260101,
    effectiveTo: OPEN_END,
    source: 'acme/refund-policy-2026.md',
    text: 'Acme refund policy (2026). Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method.',
  },
  {
    docId: 'acme-shipping',
    tenantId: 'acme',
    tags: ['shipping'],
    visibility: 'public',
    effectiveFrom: 20250101,
    effectiveTo: OPEN_END,
    source: 'acme/shipping.md',
    text: 'Acme shipping. Standard orders arrive in three to five business days. Express orders arrive the next business day.',
  },
  {
    docId: 'acme-internal-goodwill',
    tenantId: 'acme',
    tags: ['internal', 'refunds'],
    visibility: 'internal',
    effectiveFrom: 20250101,
    effectiveTo: OPEN_END,
    source: 'acme/internal/goodwill.md',
    text: 'Internal note. Any agent may approve a goodwill refund up to 50 euros without asking a manager.',
  },
  {
    docId: 'globex-refunds',
    tenantId: 'globex',
    tags: ['policy', 'refunds'],
    visibility: 'public',
    effectiveFrom: 20250101,
    effectiveTo: OPEN_END,
    source: 'globex/returns.md',
    text: 'Globex returns. Customers can return an item and get a refund within 60 days of delivery, no questions asked.',
  },
  {
    docId: 'globex-shipping',
    tenantId: 'globex',
    tags: ['shipping'],
    visibility: 'public',
    effectiveFrom: 20250101,
    effectiveTo: OPEN_END,
    source: 'globex/shipping.md',
    text: 'Globex shipping. All orders ship from Rotterdam and arrive within seven business days.',
  },
];

export type Role = 'customer' | 'staff';
/**
 * What each role may read. A single-valued field on purpose: an allow-list of TAGS ($in) would let a
 * document tagged [internal, refunds] through for customers, because $in matches any one allowed tag.
 */
export const ROLE_VISIBILITY: Record<Role, TenantDoc['visibility'][]> = {
  customer: ['public'],
  staff: ['public', 'internal'],
};

export type Filter = Record<string, unknown>;

/** "2026-06-01" → 20260601. */
export const dateNumber = (iso: string) => Number(iso.replaceAll('-', ''));

const ALLOWED_FIELDS = new Set(['tags', 'effectiveFrom', 'effectiveTo']);
const ALLOWED_OPS = new Set(['$eq', '$in', '$all', '$gte', '$lte', '$gt', '$lt']);
const FORBIDDEN = new Set(['$or', '$not', '$nor']);

/**
 * Validates a learner-supplied filter: only allowlisted fields and operators, and nothing that could
 * widen or replace the tenant scope ($or, $not, $nor, tenantId). Returns the reasons it is unsafe.
 */
export function validateLearnerFilter(filter: unknown): string[] {
  const reasons: string[] = [];
  const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number';
  const visit = (node: unknown, path: string) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      reasons.push(`${path || 'filter'} must be an object`);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const at = path ? `${path}.${k}` : k;
      if (k === 'tenantId') reasons.push(`${at}: the tenant comes from the session, not the filter`);
      else if (FORBIDDEN.has(k)) reasons.push(`${at}: ${k} could widen the tenant scope`);
      else if (k === '$and') {
        if (!Array.isArray(v)) reasons.push(`${at} must be an array`);
        else v.forEach((c, i) => visit(c, `${at}[${i}]`));
      } else if (k.startsWith('$')) reasons.push(`${at}: operator not allowed here`);
      else if (!ALLOWED_FIELDS.has(k)) reasons.push(`${at}: field not allowed`);
      else if (isScalar(v)) continue;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [op, val] of Object.entries(v)) {
          if (FORBIDDEN.has(op)) reasons.push(`${at}.${op}: ${op} could widen the tenant scope`);
          else if (!ALLOWED_OPS.has(op)) reasons.push(`${at}.${op}: unsupported operator`);
          else if (!(isScalar(val) || (Array.isArray(val) && val.every(isScalar))))
            reasons.push(`${at}.${op}: value must be a string, number or list of them`);
        }
      } else reasons.push(`${at}: value must be a string, number or operator object`);
    }
  };
  visit(filter, '');
  return reasons;
}

/** The server-built filter: tenant first (never optional), then role visibility, date window and the learner filter. */
export function buildFilter(o: { tenant: string; role: Role; asOf: number; learner?: Filter }): Filter {
  const clauses: Filter[] = [
    { tenantId: { $eq: o.tenant } },
    { visibility: { $in: ROLE_VISIBILITY[o.role] } },
    { effectiveFrom: { $lte: o.asOf } },
    { effectiveTo: { $gte: o.asOf } },
  ];
  if (o.learner && Object.keys(o.learner).length) clauses.push(o.learner);
  return { $and: clauses };
}

/** Defence in depth: hits that belong to another tenant (should always be empty). */
export const leaksOf = (hits: { tenantId?: unknown; docId?: unknown }[], tenant: string) =>
  hits.filter((h) => h.tenantId !== tenant).map((h) => String(h.docId));
