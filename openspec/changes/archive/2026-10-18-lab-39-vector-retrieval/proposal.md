# Proposal

## Why

Retrieval is where RAG succeeds or fails before any model writes an answer. Learners need to run top-k semantic search over an index, read similarity scores, see the source snippet behind each hit, and handle three cases honestly:

- an empty index;
- a question with nothing relevant;
- a hit that matches the question but cannot answer it.

The spike shows the last case concretely. With 200-character recursive chunks, heading-only chunks such as `## Refunds` score highest (0.915) and push the chunk with the actual fact ("within 30 days") to rank 3.

## What Changes

- **New lab `lab-39`** (Module 08). It runs top-k search for 1–6 questions against one of three indexes:
  - `build` (default): the course corpus indexed in this run (in memory), with `sections` chunking (one Markdown section up to 320 characters, or one paragraph up to 250, per chunk) or `recursive-200` (the contrast);
  - `lab-38`: the persistent L38 libSQL index for the selected embedder;
  - `empty`: an empty index.
- **Per hit:** rank, score, document, source, chunk offsets, and a **snippet** windowed around the query's keywords, with absolute offsets verified against the source text.
- **Threshold.** A `minScore` threshold (default 0.25) removes weak hits. A question with no hit above it gets `no-relevant-results`. An empty index gets `empty-index`, with no error and no hits.
- **Fixtures.** Each question can declare an expectation: `{ docId, contains }` for the rank-1 hit, or `"none"`. The example has five answerable questions and one unrelated question.
- **Embedders** are L38's: the mock offline; OpenAI live, with a key and a cost notice. Live query embedding costs a few tokens per question.
- **Checks:**
  - `expected-order`;
  - `scores-ranked`;
  - `snippets-traceable`;
  - `empty-index-handled`.

## Capabilities

### New Capabilities

- `course-labs/lab-39-vector-retrieval`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-39/`. It reuses `lab-37` chunks and corpus, `lab-38` embedders and index naming, and `withVectorStore`. Offline is free.
