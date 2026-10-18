/**
 * App-side hybrid retrieval: BM25 keyword scoring plus vector similarity, fused by Reciprocal Rank Fusion
 * (RRF) or a weighted blend of min-max-normalised scores. Pure and deterministic: ties break by id.
 * (Mastra's QueryVectorParams has an optional sparseVector, but @mastra/libsql ignores it, so hybrid
 * search is composed here explicitly.)
 */

export interface Passage {
  id: string;
  docId: string;
  source: string;
  text: string;
}

const STOP = new Set(
  'a an and are as at be by can do does for from has have how i if in is it its me my of on or our so than that the their them then there these they this to was we what when where which who why will with you your'.split(
    ' ',
  ),
);

/** Lower-cased tokens; identifiers such as "E-5003" or "ORD-5521" stay whole. Stopwords removed. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []).filter((t) => !STOP.has(t));
}

export interface Bm25Params {
  k1: number;
  b: number;
}
export const BM25_DEFAULTS: Bm25Params = { k1: 1.2, b: 0.75 };

/** Okapi BM25 over the passages; returns a score per passage id (0 when no query term matches). */
export function bm25Scores(passages: Passage[], query: string, p: Bm25Params = BM25_DEFAULTS) {
  const docs = passages.map((d) => ({ id: d.id, terms: tokenize(d.text) }));
  const N = docs.length;
  const avgdl = docs.reduce((n, d) => n + d.terms.length, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(tokenize(query))];
  const scores = new Map<string, { score: number; matched: string[] }>();
  for (const d of docs) {
    let score = 0;
    const matched: string[] = [];
    for (const t of q) {
      const f = d.terms.filter((x) => x === t).length;
      if (!f) continue;
      matched.push(t);
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (p.k1 + 1)) / (f + p.k1 * (1 - p.b + (p.b * d.terms.length) / avgdl)));
    }
    scores.set(d.id, { score, matched });
  }
  return scores;
}

export interface Ranked {
  id: string;
  score: number;
  rank: number | null;
}

/** Ranks by score (descending, ties by id); entries with score ≤ floor are unranked (rank null). */
export function rank(scores: Map<string, number>, floor = 0): Map<string, Ranked> {
  const sorted = [...scores].filter(([, s]) => s > floor).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = new Map<string, Ranked>();
  sorted.forEach(([id, score], i) => out.set(id, { id, score, rank: i + 1 }));
  for (const [id, score] of scores) if (!out.has(id)) out.set(id, { id, score, rank: null });
  return out;
}

export type FusionMethod = 'rrf' | 'weighted' | 'keyword-only' | 'vector-only';

export interface FusedHit {
  id: string;
  fused: number;
  keyword: { score: number; rank: number | null; matched: string[] };
  vector: { score: number; rank: number | null };
  /** Min-max normalised component scores (what the weighted method blends). */
  normalized: { keyword: number; vector: number };
  /** Human-readable arithmetic that reproduces `fused` from the components. */
  explanation: string;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Fuses keyword and vector rankings.
 * - rrf: Σ 1 / (k + rank) over the lists where the passage is ranked (k = 60 by default).
 * - weighted: alpha · normVector + (1 − alpha) · normKeyword, each min-max normalised over ranked hits.
 */
export function fuse(
  keyword: Map<string, Ranked & { matched: string[] }>,
  vector: Map<string, Ranked>,
  method: FusionMethod,
  o: { k: number; alpha: number },
): FusedHit[] {
  const ids = [...new Set([...keyword.keys(), ...vector.keys()])];
  const norm = (m: Map<string, Ranked>) => {
    const vals = [...m.values()].filter((x) => x.rank !== null).map((x) => x.score);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return (id: string) => {
      const x = m.get(id);
      if (!x || x.rank === null) return 0;
      return hi === lo ? 1 : (x.score - lo) / (hi - lo);
    };
  };
  const nk = norm(keyword);
  const nv = norm(vector);
  const hits = ids.map((id): FusedHit => {
    const kw = keyword.get(id) ?? { id, score: 0, rank: null, matched: [] };
    const ve = vector.get(id) ?? { id, score: 0, rank: null };
    let fused: number;
    let explanation: string;
    if (method === 'rrf') {
      const a = kw.rank ? 1 / (o.k + kw.rank) : 0;
      const b = ve.rank ? 1 / (o.k + ve.rank) : 0;
      fused = a + b;
      explanation = `rrf = ${kw.rank ? `1/(${o.k}+${kw.rank})` : '0 (no keyword match)'} + ${ve.rank ? `1/(${o.k}+${ve.rank})` : '0 (not in vector results)'} = ${r4(fused)}`;
    } else if (method === 'weighted') {
      fused = o.alpha * nv(id) + (1 - o.alpha) * nk(id);
      explanation = `weighted = ${o.alpha} × ${r4(nv(id))} (vector, normalised) + ${r4(1 - o.alpha)} × ${r4(nk(id))} (keyword, normalised) = ${r4(fused)}`;
    } else if (method === 'keyword-only') {
      fused = kw.rank ? kw.score : 0;
      explanation = `keyword-only = bm25 ${r4(kw.score)}`;
    } else {
      fused = ve.rank ? ve.score : 0;
      explanation = `vector-only = cosine ${r4(ve.score)}`;
    }
    return {
      id,
      fused: r4(fused),
      keyword: { score: r4(kw.score), rank: kw.rank, matched: kw.matched },
      vector: { score: r4(ve.score), rank: ve.rank },
      normalized: { keyword: r4(nk(id)), vector: r4(nv(id)) },
      explanation,
    };
  });
  return hits.filter((h) => h.fused > 0).sort((a, b) => b.fused - a.fused || a.id.localeCompare(b.id));
}

/** Recomputes a hit's fused score from its components (used to verify the explanation). */
export function recompute(h: FusedHit, method: FusionMethod, o: { k: number; alpha: number }) {
  if (method === 'rrf')
    return r4((h.keyword.rank ? 1 / (o.k + h.keyword.rank) : 0) + (h.vector.rank ? 1 / (o.k + h.vector.rank) : 0));
  if (method === 'weighted') return r4(o.alpha * h.normalized.vector + (1 - o.alpha) * h.normalized.keyword);
  if (method === 'keyword-only') return h.keyword.rank ? h.keyword.score : 0;
  return h.vector.rank ? h.vector.score : 0;
}
