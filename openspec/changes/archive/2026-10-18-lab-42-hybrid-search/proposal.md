# Proposal

## Why

Vector search understands paraphrases but blurs exact tokens: the mock embedder ranked error E-7001 first for "What does error E-5003 mean?". Keyword search finds exact codes and identifiers, but nothing when the wording differs: "Will I get my money returned?" shares no term with the refund policy. Hybrid search combines both. Learners need to see:

- how the two rankings are fused;
- why the fused order is what it is, with every score explained;
- that the fusion is deterministic and testable.

## What Changes

- **No native hybrid here.** The installed stack has no hybrid search for our store: Mastra's `QueryVectorParams.sparseVector` exists, but `@mastra/libsql` ignores it. The lab therefore composes hybrid retrieval in app code, as the brief requires when there is no native support.
- **New lab `lab-42`** (Module 09). For each question over a fictional support passage set (policies plus error codes and order formats):
  - **keyword:** Okapi BM25 (k1 1.2, b 0.75) with identifier-preserving tokens (`E-5003` stays whole);
  - **vector:** cosine similarity with the L38 embedders (mock offline, OpenAI live) over an in-memory exact index, with a minimum score of 0.25 to be ranked;
  - **fusion**, selectable:
    - `rrf` (default, k = 60): `Σ 1/(k + rank)`;
    - `weighted` (`alpha` · normalised vector + (1 − alpha) · normalised keyword);
    - `keyword-only` and `vector-only` for comparison.
- **Every hit is explained:** BM25 score, rank and matched terms; cosine and rank; normalised components; and the fused score with its arithmetic as text.
- **Comparison.** Every question is also scored under all four methods, and top-1 accuracy per method is reported. In the example, keyword gets 3/5, vector 4/5, and hybrid (RRF and weighted) 5/5.
- **Checks:**
  - `hybrid-expected-top`;
  - `hybrid-beats-single`;
  - `scoring-explained`: the fused score recomputes from the shown components;
  - `deterministic`: two fusions give the same order;
  - `complementary`: at least one keyword-only miss and one vector-only miss are fixed by hybrid.

## Capabilities

### New Capabilities

- `course-labs/lab-42-hybrid-search`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-42/`. Offline is free; live embeds about 14 short texts.
