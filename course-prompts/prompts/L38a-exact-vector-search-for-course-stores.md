# L38a — Exact vector search for course stores

**Module:** 08 RAG and Knowledge Systems · **Step 51 of 91** · **OpenSpec change:** `fix-exact-vector-search`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L38](L38-embeddings-and-store.md) · Next: [L39](L39-vector-retrieval.md)

## Copy-ready prompt

Implement platform follow-up L38a — "Exact vector search for course stores".

Why: libSQL's approximate index degrades under in-place rewrites (L38 rewrites its records to prove idempotency), so a record is occasionally not its own top hit, and metadata filters are applied only after the approximate search. LibSQLVector searches exactly (cosine, filter in SQL before ranking) when a table has no approximate index, which is correct and fast enough for course-sized stores. Check this behaviour against the installed @mastra/libsql version before relying on it.

Requirements: add openExactVectorStore(file, indexes) to packages/mastra-runtime: create missing index tables through LibSQLVector, drop the approximate indexes with plain SQL (pin @libsql/client to the version @mastra/libsql uses), return a store that searches exactly. Use it in L38 and in the later labs that read the L38 store (L39, L41). Mastra memory (L24) keeps its own index and the L24a lock.

Definition of done: tests show no approximate index after opening, upsert by id still replaces, and a filtered query returns the only matching record even when it is the least similar; a stress run of repeated L38 runs passes every time. Add a COMPATIBILITY row on exact versus approximate search.

First create an OpenSpec change named fix-exact-vector-search with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
