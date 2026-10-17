import { z } from 'zod';

/** What the model is asked for. Lenient on purpose: models return labels in many spellings. */
export const RawTriageSchema = z.object({
  category: z.string().describe('billing, technical, account, shipping or other'),
  priority: z.string().describe('low, medium or high'),
  summary: z.string().describe('One or two sentences'),
  tags: z.array(z.string()).describe('Up to five short keywords'),
  needsHuman: z.string().describe('"yes" if a person must follow up, otherwise "no"'),
});
export type RawTriage = z.infer<typeof RawTriageSchema>;

/** What the application relies on. Strict: every field canonical. */
export const TriageSchema = z
  .object({
    category: z.enum(['billing', 'technical', 'account', 'shipping', 'other']),
    priority: z.enum(['low', 'medium', 'high']),
    summary: z.string().min(1).max(200),
    tags: z
      .array(z.string().regex(/^[a-z0-9-]{1,24}$/))
      .max(5)
      .refine((t) => new Set(t).size === t.length, 'tags must be unique'),
    needsHuman: z.boolean(),
  })
  .strict();
export type Triage = z.infer<typeof TriageSchema>;

const CATEGORY_SYNONYMS: Record<string, Triage['category']> = {
  billing: 'billing',
  payment: 'billing',
  payments: 'billing',
  invoice: 'billing',
  refund: 'billing',
  technical: 'technical',
  tech: 'technical',
  'tech support': 'technical',
  bug: 'technical',
  account: 'account',
  login: 'account',
  shipping: 'shipping',
  delivery: 'shipping',
};
const PRIORITY_SYNONYMS: Record<string, Triage['priority']> = {
  low: 'low',
  minor: 'low',
  medium: 'medium',
  normal: 'medium',
  moderate: 'medium',
  high: 'high',
  urgent: 'high',
  critical: 'high',
};

const clean = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Explicit normalization wrapper: raw model output → canonical TriageSchema value, listing every change. */
export function normalizeTriage(raw: RawTriage): { value: Triage; applied: string[] } {
  const applied: string[] = [];
  const note = (field: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) applied.push(`${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  };

  const catKey = clean(raw.category).toLowerCase();
  const category = CATEGORY_SYNONYMS[catKey] ?? 'other';
  note('category', raw.category, category);

  const priority = PRIORITY_SYNONYMS[clean(raw.priority).toLowerCase()] ?? 'medium';
  note('priority', raw.priority, priority);

  let summary = clean(raw.summary);
  if (summary.length > 200) summary = `${summary.slice(0, 199).trimEnd()}…`;
  if (!summary) summary = '(no summary)';
  note('summary', raw.summary, summary);

  const tags = [
    ...new Set(
      raw.tags
        .map((t) =>
          clean(t)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24),
        )
        .filter(Boolean),
    ),
  ].slice(0, 5);
  note('tags', raw.tags, tags);

  const needsHuman = /^(yes|true|y|1)$/i.test(clean(raw.needsHuman));
  note('needsHuman', raw.needsHuman, needsHuman);

  return { value: TriageSchema.parse({ category, priority, summary, tags, needsHuman }), applied };
}
