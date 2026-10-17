# Proposal

## Why

Module 05 begins memory: an agent that remembers the conversation. Until now every Mastra instance in the platform used in-memory storage, which Mastra itself warns is not durable. Learners must:

- configure a real storage adapter,
- see their conversation stored chronologically,
- prove that it survives a restart.

The owner's priorities ask for persistent storage to be introduced properly here, as a platform capability later labs reuse (L22 threads, L23 working memory, durable approvals).

## What Changes

- **Dependencies** (exact, compatible with `@mastra/core` 1.78.0): `@mastra/memory` 1.38.0 and `@mastra/libsql` 1.26.2, in `packages/mastra-runtime`.
- **Platform storage service.**
  - `openMemory(file, options)` in `mastra-runtime` creates a `LibSQLStore` on a local SQLite file, runs `init()`, and returns `{ storage, memory, close() }`.
  - Labs get it through `services.memory.open(name, options)`. The file is `<dataDir>/memory/<name>.db` (`MLP_DATA_DIR` overridable, gitignored).
  - Names are validated slugs.
- **New lab `lab-21`** (Module 05, Memory):
  - one agent with `Memory({ storage, options: { lastMessages } })`;
  - learner messages sent into a named thread (`memory: { thread, resource }`);
  - a simulated restart: the store is closed and new store, memory and agent instances are created;
  - a follow-up question answered from history loaded from disk;
  - the history inspected with `memory.recall()` (chronological, with timestamps);
  - a reset toggle to start the thread fresh or keep accumulating across runs.
- **Integration test (definition of done).** Two separate Node processes (spawned with tsx) share one database file. Process 1 writes a conversation and exits. Process 2 recalls the thread and answers from it.

## Capabilities

### New Capabilities

- `lab-storage`: durable storage for labs
- `course-labs/lab-21-persistent-message-history`

### Modified Capabilities

(none)

## Impact

- **Code:** `packages/mastra-runtime/src/memory-store.ts`, `packages/labs/src/services.ts`, `packages/labs/src/lab-21/`.
- **Runtime:** the native `libsql` binary must load in dev, the test suite and the production bundle (`@mastra/libsql` stays external to the tsup bundle).
- **Cost:** offline is free. Live mode makes one model call per message.
