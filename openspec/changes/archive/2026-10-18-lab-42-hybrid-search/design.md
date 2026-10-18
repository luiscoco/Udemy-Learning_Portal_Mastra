# Design

## Context

- **No native hybrid search here.**
  - `@mastra/core` `QueryVectorParams` has `sparseVector?: SparseVector` "for hybrid query", and `UpsertVectorParams` has `sparseVectors`.
  - `@mastra/libsql` 1.26.2 has no reference to sparse vectors, so it ignores them.
  - `@mastra/rag` 2.6.6 has no BM25 or keyword retriever.
- **Spike** with the L38 mock embedder over the lab passages (top-1 per method):

  | Question | keyword | vector | rrf | weighted |
  | --- | --- | --- | --- | --- |
  | "What does error E-5003 mean?" | err-5003 | **err-7001** | err-5003 | err-5003 |
  | "Will I get my money returned?" | **none** | refunds | refunds | refunds |
  | "When will my parcel be delivered?" | **none** | shipping | shipping | shipping |
  | "My card was declined, what should I do?" | err-4012 | err-4012 | err-4012 | err-4012 |
  | "Is water damage covered?" | warranty | warranty | warranty | warranty |

## Decisions

- **Tokenisation.** Lower-case, with letter and digit runs joined by inner dashes (`e-5003`, `ord-5521`), minus English stopwords. No stemming, so the keyword miss for "returned" versus "refund" is visible.
- **BM25.** Standard Okapi: `idf = ln(1 + (N − n + 0.5)/(n + 0.5))`, `k1 = 1.2`, `b = 0.75`. A passage is ranked only if some query term matches (score > 0).
- **Vector.** The L38 embedder embeds the passages and the question. Scores are exact cosine (`InMemoryVector`, sorted with ties broken by id). A passage is ranked only if its cosine is at least `vectorFloor` (default 0.25, as in L39).
- **Fusion.**
  - `rrf`: `1/(k + rankKeyword) + 1/(k + rankVector)`, with an unranked list contributing 0. k is 1–200, default 60.
  - `weighted`: min-max normalise each list over its ranked hits (a single hit normalises to 1), then `alpha · v + (1 − alpha) · kw`. alpha is 0–1, default 0.5.
  - Sorting is by fused score, ties by id.
  - Every hit carries `{ keyword: { score, rank, matched }, vector: { score, rank }, normalized, fused, explanation }`.
- **Determinism.** The fusion is pure. The lab fuses twice and compares the orders, and a unit test pins exact fused values for fixed inputs.
- **Questions.** 1–6, each with an optional `expect: { id }`. The example has the five questions in the table, each expecting its correct passage.
- **Checks:**
  - `hybrid-expected-top`: the selected method's top-1 equals `expect.id` for every question that has one;
  - `hybrid-beats-single`: the selected method's accuracy ≥ max(keyword-only, vector-only);
  - `scoring-explained`: every hit's `recompute(...) === fused`, and the explanation string contains the components;
  - `deterministic`;
  - `complementary`: the run contains a keyword-only miss fixed by the selected method *and* a vector-only miss fixed by it. Only reported when the selected method is `rrf` or `weighted`.

## Risks

- **Live accuracy can differ.** Real embeddings may get E-5003 right on their own, so vector-only does not miss. `complementary` then fails live. The live check therefore uses `hybrid-expected-top` and `hybrid-beats-single`, and `complementary` is documented as offline evidence. It is not reported in live mode.
