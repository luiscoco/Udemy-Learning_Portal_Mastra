# Proposal

## Why

The full e2e suite failed intermittently on L24 (Semantic recall): "Run succeeded — some checks failed". Reproduced in a stress test: waves of 8 concurrent L24 runs sharing the libSQL vector file recalled their own fact in only 0–5 of 8 cases. `@mastra/libsql` searches with `vector_top_k` over its approximate index, and when several connections write to the same index at once, that search misses vectors that are present. Run alone, L24 always passed. Learners hit the same problem with two tabs, and the shared vector file also grew with every run.

## What Changes

- **New `shared/vector-store-lock.ts`.** `withVectorStore(file, work, signal)` lets runs that use a libSQL vector file take turns, per file, within the process.
- **L24** runs its store section under that lock. In `finally` it deletes the vectors it wrote, so the shared store no longer grows run after run.
- **`RecordingVector`** (mastra-runtime) records the ids it writes per index and offers `deleteWritten()`. This is additive.
- **Regression test.** Three waves of 8 concurrent L24 runs. It fails without the lock (4–5 of 8) and passes with it.
- **Docs.** A COMPATIBILITY row on libSQL vector concurrency, and a RELEASE-GATES note: a libSQL vector file must not be shared across processes.

## Capabilities

### Modified Capabilities

- `course-labs/lab-24-semantic-recall`

## Impact

`packages/labs/src/lab-24/run.ts`, `packages/labs/src/shared/vector-store-lock.ts` and `packages/mastra-runtime/src/vector-tools.ts`. L38–L41 will use the same lock.
