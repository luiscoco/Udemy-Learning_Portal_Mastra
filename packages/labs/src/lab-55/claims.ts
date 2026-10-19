import { z } from 'zod';
import type { CitedAnswer } from '@mlp/contracts';
import { locateQuote } from '../lab-44/claims.js';
import { citationsOf, sentencesOf, structuralIssues, supportRatio, type Issue, type Note } from '../lab-51/grounding.js';
import { sourceById } from '../lab-51/sources.js';

export const ClaimSchema = z.object({
  sentence: z.string(),
  citations: z.array(z.number().int()),
  status: z.enum(['supported', 'flagged']),
  reasons: z.array(z.string()),
  /** Share of the sentence's content words found in its cited notes (shown for transparency; not a verdict live). */
  overlap: z.number(),
  injected: z.boolean(),
});
export type Claim = z.infer<typeof ClaimSchema>;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const matches = (sentence: string, issue: Issue) => {
  const a = norm(sentence);
  const b = norm(issue.sentence);
  return b.length > 0 && (a.includes(b) || b.includes(a));
};

/**
 * Every sentence of the draft becomes a claim. A claim is flagged when the orchestrator's structural check
 * flags it (never delegated to a model) or when a fact-checker issue matches it. Fact-checker issues that
 * match no sentence are returned as unmatched.
 */
export function classifyClaims(draft: string, notes: readonly Note[], modelIssues: readonly Issue[], injected: string | null) {
  const structural = structuralIssues(draft, notes).filter((i) => i.sentence);
  const used = new Set<Issue>();
  const claims: Claim[] = sentencesOf(draft).map((sentence) => {
    const own = [...structural.filter((i) => i.sentence === sentence), ...modelIssues.filter((i) => matches(sentence, i))];
    for (const i of own) used.add(i);
    const reasons = [...new Set(own.map((i) => `${i.kind}: ${i.problem}`))];
    return {
      sentence,
      citations: citationsOf(sentence),
      status: reasons.length ? 'flagged' : 'supported',
      reasons,
      overlap: Math.round(supportRatio(sentence, notes) * 100) / 100,
      injected: !!injected && norm(sentence) === norm(injected),
    };
  });
  return { claims, unmatched: modelIssues.filter((i) => !used.has(i)) };
}

/** The published answer in the L44 CitedAnswer contract: supported claims with located quotes; flagged ones blocked. */
export function toCitedAnswer(claims: readonly Claim[], notes: readonly Note[], published: boolean): CitedAnswer {
  const sources: CitedAnswer['sources'] = {};
  const shown = published ? claims.filter((c) => c.status === 'supported') : [];
  const out = shown.map((c) => ({
    text: c.sentence,
    citations: c.citations.flatMap((n) => {
      const note = notes.find((x) => x.n === n);
      const source = note && sourceById(note.sourceId);
      const span = note && source ? locateQuote(source.text, note.quote) : null;
      if (!note || !source || !span) return [];
      sources[source.sourceId] = { title: source.title, location: `${source.title} (${source.sourceId})`, text: source.text };
      return [{ n, sourceId: source.sourceId, quote: note.quote, quoteStart: span.start, quoteEnd: span.end }];
    }),
  }));
  return {
    claims: out.filter((c) => c.citations.length > 0),
    sources,
    blocked: claims.filter((c) => c.status === 'flagged').map((c) => ({ text: c.sentence, reasons: c.reasons.slice(0, 10) })),
    fallback: out.filter((c) => c.citations.length > 0).length === 0,
  };
}
