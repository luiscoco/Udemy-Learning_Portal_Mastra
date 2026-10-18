import { z } from 'zod';
import { contentWords } from './sources.js';

/** A finding accepted by record_finding: the quote is verbatim in its source. */
export const NoteSchema = z.object({
  n: z.number().int().min(1),
  claim: z.string().min(1).max(400),
  sourceId: z.string(),
  quote: z.string().min(1).max(400),
});
export type Note = z.infer<typeof NoteSchema>;

export const ISSUE_KINDS = ['uncited', 'unknown-citation', 'unsupported'] as const;
export const IssueSchema = z.object({
  sentence: z.string().max(600),
  kind: z.enum(ISSUE_KINDS),
  problem: z.string().max(300),
});
export type Issue = z.infer<typeof IssueSchema>;

/** What the reviewer returns (structured output). */
export const ReviewSchema = z.object({ approved: z.boolean(), issues: z.array(IssueSchema).max(20) });
export type Review = z.infer<typeof ReviewSchema>;

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Sentences of a draft. Markdown headings and bullets are ignored; a trailing "[n]" after the full stop stays with its sentence. */
export function sentencesOf(text: string): string[] {
  const flat = text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = flat.split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && /^(\[\d+(?:\s*,\s*\d+)*\]\s*)+[.!?]?$/.test(p)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

export function citationsOf(sentence: string): number[] {
  return [...sentence.matchAll(CITE)].flatMap((m) => m[1]!.split(',').map((x) => Number(x.trim())));
}
export const stripCitations = (s: string) => s.replace(CITE, '').replace(/\s+([.!?,])/g, '$1').trim();

/** Uncited sentences and citations to notes that do not exist. Always checked by the orchestrator. */
export function structuralIssues(draft: string, notes: readonly Note[]): Issue[] {
  const known = new Set(notes.map((n) => n.n));
  const sentences = sentencesOf(draft);
  if (sentences.length === 0) return [{ sentence: '', kind: 'uncited', problem: 'The draft is empty.' }];
  const issues: Issue[] = [];
  for (const sentence of sentences) {
    const cites = citationsOf(sentence);
    if (cites.length === 0) issues.push({ sentence, kind: 'uncited', problem: 'The sentence cites no note.' });
    else {
      const unknown = cites.filter((c) => !known.has(c));
      if (unknown.length)
        issues.push({
          sentence,
          kind: 'unknown-citation',
          problem: `Cites ${unknown.map((u) => `[${u}]`).join(', ')}, but only notes 1–${notes.length} exist.`,
        });
    }
  }
  return issues;
}

/** Share of a sentence's content words that appear in the notes it cites. */
export function supportRatio(sentence: string, notes: readonly Note[]): number {
  const cited = new Set(citationsOf(sentence));
  const noteWords = new Set(notes.filter((n) => cited.has(n.n)).flatMap((n) => contentWords(`${n.claim} ${n.quote}`)));
  const words = [...new Set(contentWords(stripCitations(sentence)))];
  if (words.length === 0) return 1;
  return words.filter((w) => noteWords.has(w)).length / words.length;
}
export const SUPPORT_THRESHOLD = 0.4;

/** Cited sentences whose words are mostly absent from the cited notes (a heuristic: the offline reviewer uses it). */
export function supportIssues(draft: string, notes: readonly Note[]): Issue[] {
  const known = new Set(notes.map((n) => n.n));
  return sentencesOf(draft)
    .filter((s) => {
      const c = citationsOf(s);
      return c.length > 0 && c.every((x) => known.has(x)) && supportRatio(s, notes) < SUPPORT_THRESHOLD;
    })
    .map((sentence) => ({ sentence, kind: 'unsupported' as const, problem: 'The cited note does not support this sentence.' }));
}

/** Union of issue lists, one entry per sentence (first wins). */
export function mergeIssues(...lists: Issue[][]): Issue[] {
  const seen = new Set<string>();
  return lists.flat().filter((i) => {
    const key = i.sentence.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Removes the flagged sentences from a draft (what a minimal revision does). */
export function withoutSentences(draft: string, flagged: readonly string[]): string {
  const drop = new Set(flagged.map((s) => s.trim()));
  return sentencesOf(draft)
    .filter((s) => !drop.has(s.trim()))
    .join(' ');
}

/** Notes as the editor receives them: the explicit handoff payload. */
export const formatNotes = (notes: readonly Note[]) =>
  notes.map((n) => `[${n.n}] ${n.claim} (source ${n.sourceId}: "${n.quote}")`).join('\n');

/** Parses notes back from formatNotes text (used by the offline scripts, which only see the prompt). */
export function parseNotes(text: string): Note[] {
  return [...text.matchAll(/^\[(\d+)\] (.+) \(source (S\d+): "(.+)"\)$/gm)].map((m) => ({
    n: Number(m[1]),
    claim: m[2]!,
    sourceId: m[3]!,
    quote: m[4]!,
  }));
}
