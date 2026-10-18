# Design

## Context

Verified offline with the L38 mock embedder over the course corpus (spike):

- **`recursive` 200/50.** Heading-only chunks rank first: `## Refunds` scored 0.915 for "How long do I have to ask for my money back?", while the chunk with "within 30 days" ranked 3rd (0.706). `## Escalation` also outranked the escalation rules.
- **`markdown` at maxSize 600 merges two sections per chunk** (Refunds with Escalation, Shipping with Warranty). The mock still ranked correctly, but **live text-embedding-3-small ranked a privacy chunk first for the refund question** (0.392 against 0.378): the topics are diluted.
- **`markdown` at maxSize 320 plus paragraphs at maxSize 250 give one section per chunk** (7 chunks). Both the mock and live text-embedding-3-small put the answer chunk first for all 5 questions, and the unrelated question scored at most 0.10.
- **Live, recursive 200/50 also ranked correctly.** The rule (0.499) beat the bare `## Refunds` heading (0.420). The heading-only trap is strongest with the keyword-like mock.
- **`headers` option.** With `headers: [["#","h1"],["##","h2"]]`, Mastra puts the heading path into the metadata and strips it from the text. `stripHeaders: false` alters the text (it adds two trailing spaces after `## Refunds`), which breaks exact offsets.
- **An unrelated question** ("What is the capital of France?") topped out at 0.118 (recursive) or 0.071 (sections).
- **Index scores.** `InMemoryVector.query` and `LibSQLVector.query` return cosine similarity (1 = same direction), sorted in descending order.

## Decisions

- **Index sources.**
  - `build` indexes the corpus in this run with an in-memory store, so it is deterministic and independent of earlier labs.
  - `lab-38` opens `<memoryDir>/lab-38-vectors.db` under `withVectorStore` and queries `indexNameFor(embedder)`. A missing or zero-count index is the `empty-index` outcome.
  - `empty` is an empty in-memory index.
- **Chunking for `build`.**
  - `sections`: `markdown` with maxSize 320 for Markdown documents, `recursive` with maxSize 250 for text, giving one section or paragraph per chunk.
  - `recursive-200`: overlap 50, which shows the heading-only failure.
- **Ranking.** `query({ topK })`, then drop hits below `minScore`. The order is the store's, and the check verifies it is non-increasing. A `belowThreshold` count is reported per question.
- **Snippets.**
  - Keywords are the query's words of 4 letters or more, minus stopwords.
  - The snippet is a window of up to 220 characters centred on the first keyword found in the chunk text (or the chunk's start), extended to word boundaries.
  - Absolute offsets are `chunk.start + local`.
  - Verification: `build` checks `sourceText.slice(snippetStart, snippetEnd) === snippet`; `lab-38` checks against the stored chunk text and its offsets.
- **Expectations.**
  - `{ docId, contains }`: the rank-1 hit's document equals `docId` and its text contains `contains`, compared case-insensitively.
  - `"none"`: no hit at or above `minScore`.
  - Expectations are not evaluated for an empty index.
- **Checks:**
  - `expected-order`: omitted for an empty index;
  - `scores-ranked`: sorted, `≤ topK`, all `≥ minScore`;
  - `snippets-traceable`;
  - `empty-index-handled`: an empty index yields `empty-index` with no hits and no error; otherwise the record count is reported.
- **Bounds.** 1–6 questions, each 3–300 characters. topK 1–10, minScore −1 to 1.

## Risks

- **Live scores differ from the mock's.** OpenAI scores are on a different scale. 0.25 separates relevant from unrelated for text-embedding-3-small in practice, and the expectations use the rank-1 document, not absolute scores.
