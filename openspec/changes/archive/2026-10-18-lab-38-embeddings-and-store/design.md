# Design

## Context

Verified against `@mastra/core` 1.78.0 and `@mastra/libsql` 1.26.2 (spike with a live OpenAI key):

- **Embedding model.** `new ModelRouterEmbeddingModel('openai/text-embedding-3-small')` from `@mastra/core/llm`:
  - `maxEmbeddingsPerCall` is 2048 and `supportsParallelCalls` is true;
  - `doEmbed({ values })` returns `{ embeddings, usage: { tokens } }`;
  - `providerOptions: { openai: { dimensions: 256 } }` reduces the dimension.
- **Registry.** `EMBEDDING_MODELS` lists text-embedding-3-small (1536), text-embedding-3-large (3072), ada-002 (1536) and gemini-embedding-001 (768). Only an OpenAI key is configured here.
- **Determinism.** The same text twice in one call gives identical vectors. Two separate calls give vectors that are **not bitwise identical**, though their cosine similarity is 1.000000.
- **libSQL upsert behaviour.**
  - An upsert with the wrong dimension throws `Vector dimension mismatch: Index "idx" expects 4 dimensions but got 3`.
  - An upsert with an existing id **replaces** the record: the count stays the same and the metadata is updated.
  - **`createIndex` on an existing index with another dimension is silently accepted**, and the index keeps its original dimension.

## Decisions

- **Embedders.**
  - Offline: `mock/concept-hash-64`, built with `createConceptEmbedder` (synonym groups plus hashed tokens, normalised), deterministic and labelled as a stand-in.
  - Live: `openai/text-embedding-3-small` and `openai/text-embedding-3-large`, offered when the OpenAI key is configured, with optional `dimensions` (256–3072, at most the model's maximum).
  - Unknown or unconfigured models are rejected with `NOT_CONFIGURED`.
- **Batching.** The batch size is configurable (1–256, default 16), capped by `maxEmbeddingsPerCall`. Each batch emits a `workflow-step` event with its token usage.
- **Index naming and guard.** Index names follow `l38_<sanitised model>_<dims>`. Before upserting, the lab calls `describeIndex`. A dimension mismatch is a typed `DIMENSION_MISMATCH` error that fails the run's checks, never a silent mix.
- **Ids.**
  - `content` (default): `sha256(docId|start|end|text)`, first 24 hex characters, so re-ingesting is idempotent.
  - `random` is the contrast: a UUID per upsert.
- **In-run verification.** Upsert all records, read the count, upsert again, read the count again, then self-query each record (`topK: 1`) and compare id and metadata. Determinism: re-embed the first 3 chunks and compare.
- **Persistence.** The libSQL store at `<memoryDir>/lab-38-vectors.db` is kept for L39 retrieval, and records stay after the run. This is the opposite of L24's per-run cleanup, because here the store *is* the product. Runs take turns with `withVectorStore`.
- **Checks:**
  - `vectors-stored`;
  - `dimensions-consistent`;
  - `idempotent-upsert`;
  - `retrievable`;
  - `deterministic-embeddings`.
- **Offline cost is 0.** Live cost is derived from the reported tokens, with prices kept in the lab: 0.02 USD per million tokens for small and 0.13 for large, labelled as list prices on 2026-10-18 and subject to change.

## Risks

- **Approximate search misses.** libSQL ANN self-query could, in principle, miss a record. Self-query uses the record's exact vector with a small index, and a miss is reported, not hidden.
