import { z } from 'zod';

/** What the agent must return (as JSON in its final message). */
export const AnswerSchema = z.object({
  answer: z.string().min(1).max(2_000),
  supported: z.boolean(),
  citations: z.array(z.object({ chunkId: z.string().min(1).max(200), quote: z.string().min(1).max(600) })).max(6),
});
export type Answer = z.infer<typeof AnswerSchema>;

/** A chunk returned by searchDocs in this run (the guard's ground truth). */
export interface RetrievedChunk {
  id: string;
  docId: string;
  source: string;
  start: number;
  end: number;
  text: string;
  score: number;
}

export type BlockReason =
  | 'UNPARSEABLE'
  | 'NO_CITATION'
  | 'UNKNOWN_CHUNK'
  | 'QUOTE_NOT_FOUND'
  | 'WEAK_SUPPORT'
  | 'UNGROUNDED_NUMBER'
  | 'CITED_BUT_UNSUPPORTED';

export const FALLBACK = "I can't confirm that from the documents I searched.";

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
/** Numbers as written (digits with optional decimal part), e.g. "30", "4.5", "500". */
export const numbersIn = (s: string) => [...new Set(s.match(/\d+(?:[.,]\d+)?/g) ?? [])];

/** Extracts the answer JSON from the model's final text (tolerates a ```json fence). */
export function parseAnswer(text: string): Answer | null {
  const m = /\{[\s\S]*\}/.exec(text.replace(/```(?:json)?/g, ''));
  if (!m) return null;
  try {
    const parsed = AnswerSchema.safeParse(JSON.parse(m[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface GuardResult {
  verdict: 'accepted' | 'blocked';
  reasons: { code: BlockReason; detail: string }[];
  shown: { answer: string; supported: boolean; citations: (Answer['citations'][number] & { chunk: RetrievedChunk })[] };
}

/** Verifies a model answer against what was actually retrieved. Pure: same inputs, same verdict. */
export function guardAnswer(raw: string, retrieved: RetrievedChunk[], minScore: number): GuardResult {
  const a = parseAnswer(raw);
  const reasons: GuardResult['reasons'] = [];
  if (!a) {
    return {
      verdict: 'blocked',
      reasons: [{ code: 'UNPARSEABLE', detail: 'the final message is not the required JSON' }],
      shown: { answer: FALLBACK, supported: false, citations: [] },
    };
  }
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const cited: GuardResult['shown']['citations'] = [];
  for (const c of a.citations) {
    const chunk = byId.get(c.chunkId);
    if (!chunk) reasons.push({ code: 'UNKNOWN_CHUNK', detail: `${c.chunkId} was not returned by searchDocs` });
    else if (!norm(chunk.text).includes(norm(c.quote)))
      reasons.push({ code: 'QUOTE_NOT_FOUND', detail: `the quote is not in ${c.chunkId}: “${c.quote.slice(0, 60)}”` });
    else cited.push({ ...c, chunk });
  }
  if (a.supported) {
    if (a.citations.length === 0)
      reasons.push({ code: 'NO_CITATION', detail: 'a supported answer must cite at least one chunk' });
    const best = Math.max(-1, ...cited.map((c) => c.chunk.score));
    if (cited.length && best < minScore)
      reasons.push({ code: 'WEAK_SUPPORT', detail: `best cited score ${best.toFixed(3)} is below ${minScore}` });
    const quotes = cited.map((c) => c.quote).join(' ');
    for (const n of numbersIn(a.answer))
      if (!numbersIn(quotes).includes(n)) reasons.push({ code: 'UNGROUNDED_NUMBER', detail: `“${n}” is not in any cited quote` });
  } else if (a.citations.length > 0) {
    reasons.push({ code: 'CITED_BUT_UNSUPPORTED', detail: 'an unsupported answer should not cite chunks' });
  }
  if (reasons.length) return { verdict: 'blocked', reasons, shown: { answer: FALLBACK, supported: false, citations: [] } };
  return { verdict: 'accepted', reasons: [], shown: { answer: a.answer, supported: a.supported, citations: cited } };
}
