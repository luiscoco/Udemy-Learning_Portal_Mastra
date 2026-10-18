# Proposal

## Why

Retrieval needs vectors that are stored correctly. Learners must see five things:

- how an embedding provider is configured, and what it costs;
- why vectors from different models or dimensions must never share an index;
- how stable record ids make re-ingestion idempotent;
- that each stored record carries enough metadata to cite its source later;
- how a deterministic mock embedder makes all of this testable offline.

## What Changes

- **New lab `lab-38`** (Module 08). Its pipeline:
  1. **Documents:** the built-in corpus or the L36 library.
  2. **Chunks:** made with the L37 analysis (recursive, configurable), keeping verified offsets.
  3. **Embedding** in batches with the selected embedder:
     - offline, a deterministic mock: the concept/hash embedder, 64 dimensions, labelled as not a real model;
     - live, `openai/text-embedding-3-small` (1536 dimensions, or reduced with `dimensions`) or `text-embedding-3-large`, through Mastra's `ModelRouterEmbeddingModel`. Only models whose provider key is configured are offered.
  4. **Upsert** into a vector store: libSQL (persistent, `lab-38-vectors`, reused by L39) or in-memory.
     - The index name is derived from embedder and dimensions (`l38_<model>_<dims>`).
     - Record ids are derived from content: `sha256(docId|start|end|text)`, truncated.
     - Metadata: `{ docId, source, start, end, chunkIndex, text, embedder, dimensions }`.
- **Verification inside the run:**
  1. the index dimension equals the embedder's dimension, checked with `describeIndex`, because `createIndex` silently keeps an old dimension;
  2. a second upsert of the same records leaves the count unchanged;
  3. each record is retrieved as the top hit when queried with its own vector, with its metadata intact;
  4. re-embedding a sample gives the same vector: identical offline, cosine ≥ 0.9999 live.
- **Contrast `idStrategy: random`:** the second upsert duplicates every record, and the idempotency check fails.
- **Costs** are reported from the provider's token usage. Live runs take a configured key and show a cost notice.
- **Concurrency.** libSQL access goes through `withVectorStore` (introduced in the L24 fix).

## Capabilities

### New Capabilities

- `course-labs/lab-38-embeddings-and-store`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-38/`. Live mode costs a few cents at most. The example has about 20 chunks and roughly 1,000 tokens with text-embedding-3-small.
