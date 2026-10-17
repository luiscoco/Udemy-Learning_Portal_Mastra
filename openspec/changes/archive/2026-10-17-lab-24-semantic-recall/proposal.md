# Proposal

## Why

`lastMessages` (L21) only brings back recent messages, and working memory (L23) only what fits a profile schema. Semantic recall finds older messages *by meaning*: each message is embedded, and the current message is used as a vector query. "What should I avoid eating?" can then surface "I'm allergic to peanuts" from weeks ago, in another thread.

Learners need to:

- configure it with Mastra's supported options;
- see exactly what was searched and recalled;
- understand topK, the message range and the scope;
- be able to test it with a stubbed vector service.

## What Changes

- **Platform (`mastra-runtime`, reused by the later RAG labs):**
  - `openMemory(file, options, { vector, embedder })` accepts a vector store and an embedder. Mastra requires a vector store whenever semantic recall is enabled.
  - `openVectorStore(file)` returns a durable `LibSQLVector` on a local file, with `close()`.
  - `InMemoryVector` is a small stub `MastraVector` for tests (cosine scoring, `$eq` metadata filters).
  - `RecordingVector` is a decorator around any `MastraVector`. It records every upsert and query: filter, topK and hits with their metadata.
  - `createConceptEmbedder({ groups, dimensions })` is a deterministic offline `EmbeddingModelV2`. It uses concept groups plus hashed tokens, is labelled `offline-sim/concept-embedder`, and is never presented as a real model.
  - `services.memory.open(name, options, extras)` and `services.memory.file(name)` give labs per-lab vector files.
- **New lab `lab-24`** (Module 05):
  - An old conversation (learner-editable) is stored for the user. Another user with a similar fact is seeded.
  - The question is asked in a **new thread**, with semantic recall configured by the learner (`enabled`, `topK`, `messageRange`, `scope`, `lastMessages`) and a vector backend (`libsql` or the `in-memory` stub).
  - The result shows the recorded vector query (filter, topK, hits with scores), the recalled messages and the answer.
- **Embeddings:** offline uses the concept embedder; live uses `openai/text-embedding-3-small` through Mastra's model router (requires `OPENAI_API_KEY`).

## Capabilities

### New Capabilities

- `course-labs/lab-24-semantic-recall`

### Modified Capabilities

- `lab-storage`: vector stores and embedders for durable memory

## Impact

- **Code:** `packages/mastra-runtime` (memory-store, a new `vector-tools.ts`), `packages/labs/src/services.ts`, `packages/labs/src/lab-24/`.
- **Cost:** offline is free. Live mode embeds every message (about 7 short embedding calls) and makes one chat call per message, plus the question.
