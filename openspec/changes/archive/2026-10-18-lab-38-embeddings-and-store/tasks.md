# Tasks

## 1. Implementation

- [x] 1.1 Embedder catalog (mock and live, per configured key), batching with usage, content ids, index naming, dimension guard; verify unit tests
- [x] 1.2 Lab 38 run (documents → chunks → embed → upsert ×2 → self-query → determinism), libSQL or in-memory under withVectorStore, definition, fixtures, solution; verify lab38.test.ts, conformance and the live check

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e`; COMPATIBILITY rows (embedding router, libSQL upsert and createIndex behaviour)

## Workflow follow-up

- Archive, commit and push.
