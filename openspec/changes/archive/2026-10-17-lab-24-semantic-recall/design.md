# Design

## Context

Verified against the installed `@mastra/core` 1.78.0, `@mastra/memory` 1.38.0 and `@mastra/libsql` 1.26.2 (spike):

- **Configuration.** `new Memory({ storage, vector, embedder, options: { lastMessages: 2, semanticRecall: { topK: 2, messageRange: 0, scope: 'resource' } } })` works with `LibSQLVector` and with a hand-written `MastraVector` subclass. Without a vector store, Mastra throws "Semantic recall requires a vector store to be configured".
- **What gets stored.** Every user and assistant message is upserted with metadata `{ message_id, thread_id, resource_id, role, content, created_at }`.
- **How each call searches.** Every `generate` call queries the vector store with the new message's embedding and the filter `{ resource_id: <user> }` (resource scope), with `topK` as configured.
- **How recalled messages reach the model.** Messages recalled from *another* thread are injected as a system message: "The following messages were remembered from a different conversation: `<remembered_from_other_conversation>` … Message from previous conversation at 2:19 PM: User: I'm allergic to peanuts." In the spike, unrelated facts (Berlin, dog, colour) were not recalled.
- **The live embedder.** `ModelRouterEmbeddingModel('openai/text-embedding-3-small')` returns 1536-dimension vectors. cos("I am allergic to peanuts", "What should I avoid eating?") = 0.324, versus 0.074 for "I live in Berlin".
- **The embedder interface.** Mastra accepts AI SDK `EmbeddingModelV2` objects (`specificationVersion: 'v2'`, `doEmbed({ values })`).

## Decisions

- **Recall is read from the recorded vector query, not from the prompt.** `RecordingVector` captures the hits for the question's query, so "what was recalled" is identical offline and live. Offline, the prompt is also checked for the `remembered_from_other_conversation` block.
- **One vector file per lab and embedder:** `lab-24-vectors-offline.db` and `lab-24-vectors-openai.db`. An index has a fixed dimension (64 offline, 1536 live), so the two can't share a file.
- **The concept embedder is honest.** It is deterministic: normalized hashed tokens plus concept groups such as food, allergy and eating, so it is semantic enough for the lesson without a network. The lesson and the result label it as a stand-in, and live mode shows real embeddings.
- **Isolation.** Run-scoped user and thread ids, as in L22 and L23. A seeded second user owns "I'm allergic to shellfish." The `scoped-to-user` check proves it is never recalled.
- **Contrast fixtures.** Recall disabled means no query and no fact. `scope: 'thread'` asked in a new thread finds nothing. Both are expected failures.

## Risks

- **Live answer wording varies.** The fact check uses the recorded hits, and only `answer-uses-fact` depends on wording (a keyword stem).
