# Proposal

## Why

First-stage retrieval is fast but coarse. A reranker looks at each candidate together with the question and reorders the short list. Learners need to see:

- how Mastra's reranker combines its signals;
- the before and after ranks for each candidate;
- that provenance survives reranking;
- how reranking fails: a missing `metadata.text` quietly gives a semantic score of 0, and a scorer reply that is not a bare number makes `@mastra/rag`'s agent scorer throw (the `@mastra/core` copy returns NaN instead).

They also need a deterministic scorer, so ranks are stable in tests.

## What Changes

- **New lab `lab-43`** (Module 09). For each question:
  - **first stage:** exact vector search over the L42 passages with the L38 embedder, top `candidates` (2–9, default 5);
  - **rerank:** Mastra's `rerankWithScorer`. The final score is `semantic · w_s + vector · w_v + position · w_p`, where weights must sum to 1 and default to 0.4 / 0.4 / 0.2.
- **Scorers:**
  - `agent` (default): Mastra's `MastraAgentRelevanceScorer`. Offline it is driven by a scripted model, so it is deterministic; live it uses the selected model, with one call per candidate.
  - `keyword`: a local deterministic `RelevanceScoreProvider` (query-term overlap). It is the fallback when no reranking provider is configured.
  - `none`: first stage only.

  Cohere and ZeroEntropy scorers exist in `@mastra/rag`, but no keys are configured. They are documented, not wired.
- **Safe scorer wrapper.** Each call is recorded with its raw value. A thrown error (`SCORER_ERROR`), a NaN, or a value outside 0–1 is replaced by 0 and flagged, so a chatty reply ("Relevance: 0.9") can neither crash nor poison the ranking. An offline `chattyScorer` toggle demonstrates this. The run survives, but loses the reranking benefit.
- **Output per candidate:** the first-stage rank and cosine; the semantic, vector and position components; the final score; the reranked rank; the movement; and the unchanged provenance (id, docId, source, text).
- **Checks:**
  - `expected-top-after-rerank`;
  - `ranks-stable` (a second rerank gives an identical order, for deterministic scorers);
  - `provenance-retained`;
  - `before-after-shown`;
  - `scorer-output-validated`.

## Capabilities

### New Capabilities

- `course-labs/lab-43-reranking`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-43/`. Offline is free. Live with the agent scorer makes one model call per candidate: 5 questions × 4 candidates = 20 short gpt-5-mini calls, roughly one to two cents.
