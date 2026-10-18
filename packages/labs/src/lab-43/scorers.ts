import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { tokenize } from '../lab-42/hybrid.js';

/** Mastra's RelevanceScoreProvider contract (from @mastra/core/relevance). */
export interface RelevanceScoreProvider {
  getRelevanceScore(query: string, text: string): Promise<number>;
}

/** Deterministic local relevance: the share of the query's terms (identifiers kept whole) found in the text. */
export function keywordRelevance(query: string, text: string): number {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return 0;
  const t = new Set(tokenize(text));
  return Math.round((q.filter((x) => t.has(x)).length / q.length) * 10_000) / 10_000;
}

export const keywordScorer: RelevanceScoreProvider = { getRelevanceScore: async (q, t) => keywordRelevance(q, t) };

export interface ScorerCall {
  passageText: string;
  raw: number;
  used: number;
  flag: 'SCORER_ERROR' | 'NOT_A_NUMBER' | 'OUT_OF_RANGE' | null;
  error?: string;
}

/**
 * Validates every relevance score before Mastra's reranker uses it. @mastra/rag's agent scorer THROWS on a
 * reply that is not a bare number in 0–1 (which would fail the whole rerank); @mastra/core's copy returns
 * parseFloat(reply), so "Relevance: 0.9" becomes NaN. Errors, NaN and out-of-range values become 0 and are
 * flagged, so one bad reply can neither crash nor poison the ranking.
 */
export class SafeScorer implements RelevanceScoreProvider {
  readonly calls: ScorerCall[] = [];
  constructor(private readonly inner: RelevanceScoreProvider) {}
  async getRelevanceScore(query: string, text: string): Promise<number> {
    let raw: number;
    try {
      raw = await this.inner.getRelevanceScore(query, text);
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 160);
      this.calls.push({ passageText: text.slice(0, 60), raw: NaN, used: 0, flag: 'SCORER_ERROR', error });
      return 0;
    }
    const flag = !Number.isFinite(raw) ? 'NOT_A_NUMBER' : raw < 0 || raw > 1 ? 'OUT_OF_RANGE' : null;
    const used = flag ? 0 : raw;
    this.calls.push({ passageText: text.slice(0, 60), raw, used, flag });
    return used;
  }
}

/**
 * Offline model behind MastraAgentRelevanceScorer: reads Query and Text from Mastra's similarity prompt
 * and answers the keyword relevance, as a plain number or, "chatty", as "Relevance: n" (which @mastra/rag rejects).
 */
export function scorerScript(chatty: boolean) {
  return (v: PromptView): ScriptedTurn => {
    const query = /Query:\s*([\s\S]*?)\n\s*\nText:/.exec(v.lastUser)?.[1]?.trim() ?? '';
    const text = /Text:\s*([\s\S]*?)\n\s*\nRelevance score/.exec(v.lastUser)?.[1]?.trim() ?? '';
    const score = keywordRelevance(query, text);
    return { text: chatty ? `Relevance: ${score}` : String(score) };
  };
}

export function validateWeights(w: { semantic: number; vector: number; position: number }) {
  const sum = w.semantic + w.vector + w.position;
  return Math.abs(sum - 1) < 1e-9 ? null : `weights must add up to 1 (got ${Math.round(sum * 1000) / 1000})`;
}
