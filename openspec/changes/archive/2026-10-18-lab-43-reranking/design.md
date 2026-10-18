# Design

## Context

Verified against `@mastra/rag` 2.6.6 (source and spike):

- **The reranking API.** `rerankWithScorer({ results, query, scorer, options: { weights?, topK = 3, queryEmbedding? } })` scores each `QueryResult` as `weights.semantic · scorer(query, metadata.text) + weights.vector · result.score + weights.position · (1 − index/n)`.
  - The default weights are 0.4 / 0.4 / 0.2, and weights that do not sum to 1 throw.
  - Results are sorted by score with a stable sort, so ties keep first-stage order, and then cut to `topK`.
  - A `queryEmbedding` only multiplies scores when its norm is above 5. Normalised embeddings are never affected, so the lab omits it.
- **The text trap.** **`semantic` is 0 when `metadata.text` is missing.** The scorer is not even called.
- **Non-numeric replies.** There are **two** `MastraAgentRelevanceScorer` implementations:
  - the one in `@mastra/rag`, which this lab uses, parses the reply with `Number()` and **throws** `Invalid relevance score returned by model: …` unless it is a bare number in 0–1. A throw fails the whole `rerankWithScorer` call (`Promise.all`);
  - the copy in `@mastra/core/relevance` returns `parseFloat(reply)`, which yields **NaN**. In the spike, a NaN semantic score made every final score NaN.
- **`rerank(results, query, model)`** picks `CohereRelevanceScorer` for `rerank-v3.5`, and `MastraAgentRelevanceScorer` otherwise.
- **Spike** (mock first stage, keyword scorer): for "What does error E-5003 mean?" the first stage ranked err-7001, then err-5003; after reranking, err-5003 led with 0.551 against 0.508. The other four questions kept their correct top-1.

## Decisions

- **First stage.** `InMemoryVector` exact search over `PASSAGES` (L42) with the L38 embedder (mock offline). The candidates are the top `candidates` hits, whose metadata carries the full passage, `text` included.
- **Scorers.**
  - `keyword`: the share of the query's L42 tokens (identifiers kept whole) that appear in the text, in 0–1.
  - `agent`: `new MastraAgentRelevanceScorer('lab43', model)`.
    - Offline, the scripted model parses `Query:` and `Text:` from Mastra's similarity prompt and answers the keyword score as a plain number.
    - With `chattyScorer` it answers `Relevance: <n>` instead, to show the NaN guard.
    - Live, it uses the selected model.
- **Safe wrapper.** `SafeScorer` implements `RelevanceScoreProvider`, catches errors, records `{ candidate, raw, used, flag, error? }`, and returns `Number.isFinite(raw) && raw ∈ [0, 1] ? raw : 0`. Flags are `SCORER_ERROR`, `NOT_A_NUMBER` and `OUT_OF_RANGE`.
- **Weights.** Learner-set `semantic`, `vector` and `position` values, rejected when they do not sum to 1 within 1e-9. The defaults are Mastra's.
- **Stability.** The lab reranks twice and compares the orders. For the live agent scorer, model replies can vary, so the check compares top-1 only, and says so.
- **Provenance.** Every reranked result's id must be in the candidate set, and its metadata (docId, source, text) must deep-equal the candidate's.
- **Checks:**
  - `expected-top-after-rerank`: the reranked top-1 equals `expect.id`; with scorer `none`, the first stage's top-1 is used;
  - `ranks-stable`;
  - `provenance-retained`;
  - `before-after-shown`: every row has a first-stage rank, a reranked rank and components;
  - `scorer-output-validated`: no NaN reached a final score, and flagged calls are listed. With the chatty toggle this check passes, because the wrapper neutralises the replies, while `expected-top-after-rerank` fails, because the semantic signal is lost.

## Risks

- **Live scorer variance.** LLM relevance scores vary between runs. The expectations use questions whose answer passage is unambiguous.
