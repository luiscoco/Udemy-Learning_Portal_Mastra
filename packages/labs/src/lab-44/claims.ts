import { z } from 'zod';
import type { CitedAnswer } from '@mlp/contracts';
import { numbersIn } from '../lab-40/guard.js';
import { tokenize } from '../lab-42/hybrid.js';

/** What the agent must return. */
export const ClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1).max(1_000),
        citations: z.array(z.object({ id: z.string().min(1).max(120), quote: z.string().min(1).max(600) })).max(6),
      }),
    )
    .max(12),
});
export type Claims = z.infer<typeof ClaimsSchema>;

export type ClaimBlock = 'UNCITED_CLAIM' | 'UNKNOWN_SOURCE' | 'QUOTE_NOT_FOUND' | 'UNSUPPORTED_CLAIM' | 'UNGROUNDED_NUMBER';

export interface SourcePassage {
  id: string;
  title: string;
  location: string;
  text: string;
}

export function parseClaims(text: string): Claims | null {
  const m = /\{[\s\S]*\}/.exec(text.replace(/```(?:json)?/g, ''));
  if (!m) return null;
  try {
    const p = ClaimsSchema.safeParse(JSON.parse(m[0]));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/**
 * Finds a quote in a passage and returns its exact span in the ORIGINAL text, tolerating differences in
 * whitespace and letter case (so highlighting points at the real characters). null when absent.
 */
export function locateQuote(passage: string, quote: string): { start: number; end: number } | null {
  const words = quote
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return null;
  const m = new RegExp(words.join('\\s+'), 'i').exec(passage);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

const contentWords = (s: string) => new Set(tokenize(s).filter((t) => t.length >= 4 || /\d/.test(t)));

export interface GuardedClaims {
  citedAnswer: CitedAnswer;
  /** Per-claim verdicts, in the model's order. */
  verdicts: { text: string; accepted: boolean; reasons: { code: ClaimBlock; detail: string }[] }[];
  parsed: boolean;
}

/** Verifies each claim on its own; only invalid claims are blocked. Pure. */
export function guardClaims(raw: string, sources: SourcePassage[], opts: { enforce: boolean }): GuardedClaims {
  const parsed = parseClaims(raw);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, { title: s.title, location: s.location, text: s.text }]));
  if (!parsed)
    return {
      parsed: false,
      verdicts: [],
      citedAnswer: {
        claims: [],
        sources: sourceMap,
        blocked: [{ text: raw.slice(0, 300), reasons: ['UNPARSEABLE: the reply is not the required JSON'] }],
        fallback: true,
      },
    };

  const numbering = new Map<string, number>();
  const nOf = (key: string) => {
    if (!numbering.has(key)) numbering.set(key, numbering.size + 1);
    return numbering.get(key)!;
  };
  const claims: CitedAnswer['claims'] = [];
  const blocked: CitedAnswer['blocked'] = [];
  const verdicts: GuardedClaims['verdicts'] = [];
  for (const c of parsed.claims) {
    const reasons: GuardedClaims['verdicts'][number]['reasons'] = [];
    const located: { id: string; quote: string; start: number; end: number }[] = [];
    if (c.citations.length === 0) reasons.push({ code: 'UNCITED_CLAIM', detail: 'the claim cites no source' });
    for (const cit of c.citations) {
      const src = byId.get(cit.id);
      if (!src) {
        reasons.push({ code: 'UNKNOWN_SOURCE', detail: `${cit.id} was not among the provided sources` });
        continue;
      }
      const span = locateQuote(src.text, cit.quote);
      if (!span) reasons.push({ code: 'QUOTE_NOT_FOUND', detail: `the quote is not in ${cit.id}: “${cit.quote.slice(0, 60)}”` });
      else located.push({ id: cit.id, quote: src.text.slice(span.start, span.end), ...span });
    }
    const quotes = located.map((l) => l.quote).join(' ');
    if (located.length) {
      const claimWords = contentWords(c.text);
      const quoteWords = contentWords(quotes);
      if (![...claimWords].some((w) => quoteWords.has(w)))
        reasons.push({ code: 'UNSUPPORTED_CLAIM', detail: 'the claim shares no content words with its quotes' });
      for (const n of numbersIn(c.text))
        if (!numbersIn(quotes).includes(n))
          reasons.push({ code: 'UNGROUNDED_NUMBER', detail: `“${n}” is not in the cited quote` });
    }
    const accepted = reasons.length === 0;
    verdicts.push({ text: c.text, accepted, reasons });
    if (accepted || !opts.enforce) {
      // With the guard off, unverified citations are shown as the model gave them (offsets 0 when not found).
      const cits = c.citations.map((cit) => {
        const l = located.find((x) => x.id === cit.id && cit.quote.trim().length > 0);
        return {
          n: nOf(cit.id),
          sourceId: cit.id,
          quote: l?.quote ?? cit.quote,
          quoteStart: l?.start ?? 0,
          quoteEnd: l?.end ?? Math.max(1, cit.quote.length),
        };
      });
      if (cits.length) claims.push({ text: c.text, citations: cits });
      else blocked.push({ text: c.text, reasons: ['UNCITED_CLAIM'] });
    } else {
      blocked.push({ text: c.text, reasons: reasons.map((r) => `${r.code}: ${r.detail}`) });
    }
  }
  return { parsed: true, verdicts, citedAnswer: { claims, sources: sourceMap, blocked, fallback: claims.length === 0 } };
}
