# Proposal

## Why

The full e2e suite failed intermittently on L38 ("some checks failed"). Reproduced: 30 sequential L38 runs on one persistent store gave one run where a record was **not its own top hit** (12/13, top score 0.825). Each L38 run rewrites its 13 records twice, by design, to prove idempotency. libSQL's approximate index (`vector_top_k`) degrades under those in-place rewrites, as it does under concurrent writers (the L24 fix). It also applies metadata filters only *after* the approximate search.

`LibSQLVector` searches exactly (brute-force cosine, with the filter in SQL before ranking) when a table has no `<index>_vector_idx`. Exact search is correct, and fast enough, for course-sized stores.

## What Changes

- **`mastra-runtime` `openExactVectorStore(file, indexes)`.** It creates any missing index tables through `LibSQLVector`, drops the approximate indexes with plain SQL (`@libsql/client`, pinned 0.18.0, the version `@mastra/libsql` uses), and returns a fresh store that searches exactly.
- **L38, L39 (`lab-38` index source) and L41** use it. L24 keeps its lock-and-cleanup fix: Mastra memory creates its own index internally.
- **Tests.**
  - `exact-vector-store.test.ts`: no approximate index after opening; upsert by id still replaces; a filtered query returns the only matching record even when it is the least similar.
  - The 30-run L38 stress (90/90 after the fix) was used for diagnosis only.
- **Docs.** A COMPATIBILITY row on exact versus approximate search in libSQL.

## Capabilities

### Modified Capabilities

- `course-labs/lab-38-embeddings-and-store`

## Impact

`packages/mastra-runtime/src/vector-tools.ts` (additive), and the `packages/labs` L38/L39 runs.
