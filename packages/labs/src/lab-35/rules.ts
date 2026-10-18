import { z } from 'zod';

// ---------- Inputs ----------

export const VendorCaseSchema = z.object({
  caseId: z.string().regex(/^C-\d{1,6}$/),
  vendor: z.object({
    name: z.string().trim().min(1).max(100),
    /** ISO 3166-1 alpha-2 style code. */
    country: z.string().regex(/^[A-Za-z]{2}$/),
    registrationId: z.string().regex(/^REG-\d{1,6}$/),
  }),
  requestedBy: z.string().trim().min(1).max(40),
  spendPerYear: z.number().min(0).max(10_000_000),
  notes: z.string().max(500),
});
export type VendorCase = z.infer<typeof VendorCaseSchema>;

export const ReviewAttemptSchema = z.object({
  reviewer: z.string().trim().min(1).max(40),
  role: z.enum(['analyst', 'manager', 'senior']),
  decision: z.enum(['approve', 'reject']),
  rationale: z.string().max(500),
});
export type ReviewAttempt = z.infer<typeof ReviewAttemptSchema>;

// ---------- Simulated data sources (fictional; labelled as simulated in the trace) ----------

export const REGISTRY: Record<string, { name: string; status: 'active' | 'dissolved'; since: number }> = {
  'REG-1001': { name: 'Northwind Supplies', status: 'active', since: 2012 },
  'REG-2002': { name: 'Blue Harbor Logistics', status: 'active', since: 2019 },
  'REG-4004': { name: 'Orion Export Group', status: 'active', since: 2016 },
  'REG-5005': { name: 'Lumen Print Works', status: 'dissolved', since: 2008 },
};
export const SANCTIONS = ['Orion Export Group', 'Crimson Trade Holdings'];
/** User-assigned ISO codes (QM–QZ, XA–XZ): fictional jurisdictions, so no real country is labelled. */
export const HIGH_RISK_COUNTRIES = ['QZ', 'XQ'];
export const MEDIA_KEYWORDS = ['fraud', 'bribery', 'lawsuit', 'litigation', 'investigation', 'bankrupt'];
export const SPEND_THRESHOLD = 100_000;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export interface RegistryFinding {
  source: 'simulated registry';
  found: boolean;
  status: string | null;
  nameMatches: boolean;
}
export interface SanctionsFinding {
  source: 'simulated sanctions list';
  hit: boolean;
  matched: string | null;
}
export interface MediaFinding {
  source: 'simulated media scan';
  hits: string[];
}

export function registryLookup(v: VendorCase['vendor']): RegistryFinding {
  const r = REGISTRY[v.registrationId];
  return { source: 'simulated registry', found: !!r && r.status === 'active', status: r?.status ?? null, nameMatches: !!r && norm(r.name) === norm(v.name) };
}
export function sanctionsScreen(v: VendorCase['vendor']): SanctionsFinding {
  const matched = SANCTIONS.find((s) => norm(s) === norm(v.name)) ?? null;
  return { source: 'simulated sanctions list', hit: matched !== null, matched };
}
export function mediaScan(notes: string): MediaFinding {
  const t = notes.toLowerCase();
  return { source: 'simulated media scan', hits: MEDIA_KEYWORDS.filter((k) => t.includes(k)) };
}

// ---------- Risk ----------

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export function scoreRisk(
  c: VendorCase,
  f: { registry: RegistryFinding; sanctions: SanctionsFinding; media: MediaFinding },
): { level: RiskLevel; score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  if (!f.registry.found || !f.registry.nameMatches) {
    score += 2;
    factors.push(f.registry.status === 'dissolved' ? 'registry: company dissolved (+2)' : 'registry: no active matching entry (+2)');
  }
  if (HIGH_RISK_COUNTRIES.includes(c.vendor.country.toUpperCase())) {
    score += 2;
    factors.push(`country ${c.vendor.country.toUpperCase()} is high risk (+2)`);
  }
  if (f.media.hits.length) {
    score += 2;
    factors.push(`adverse media: ${f.media.hits.join(', ')} (+2)`);
  }
  if (c.spendPerYear > SPEND_THRESHOLD) {
    score += 1;
    factors.push(`spend above ${SPEND_THRESHOLD} (+1)`);
  }
  if (f.sanctions.hit) return { level: 'blocked', score, factors: [`sanctions list match: ${f.sanctions.matched}`, ...factors] };
  return { level: score <= 1 ? 'low' : score <= 3 ? 'medium' : 'high', score, factors };
}

// ---------- Reviewer controls ----------

export const MAX_ATTEMPTS = 3;
export const MIN_RATIONALE = 20;
export const REQUIRED_ROLES: Record<'medium' | 'high', ReviewAttempt['role'][]> = { medium: ['manager', 'senior'], high: ['senior'] };
export type Violation = 'SOD' | 'AUTHORITY' | 'RATIONALE';

/** Pure control check: segregation of duties, authority for the risk level, documented rationale. */
export function checkControls(requestedBy: string, level: 'medium' | 'high', a: ReviewAttempt): Violation[] {
  const v: Violation[] = [];
  if (norm(a.reviewer) === norm(requestedBy)) v.push('SOD');
  if (!REQUIRED_ROLES[level].includes(a.role)) v.push('AUTHORITY');
  if (a.rationale.trim().length < MIN_RATIONALE) v.push('RATIONALE');
  return v;
}

export type Branch = 'auto-approved' | 'approved' | 'rejected' | 'blocked' | 'pending-review';
