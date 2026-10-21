# L24a — Vector recall under concurrent runs

**Module:** 05 Conversational Memory · **Step 35 of 89** · **OpenSpec change:** `fix-lab-24-vector-concurrency`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L24](L24-semantic-recall.md) · Next: [L25](L25-observational-memory.md)

## Copy-ready prompt

Implement platform follow-up L24a — "Vector recall under concurrent runs".

Why: with @mastra/libsql, several connections writing to the same vector file at once make the approximate vector_top_k search miss vectors that are present. Concurrent L24 runs (e2e workers, two browser tabs) then fail to recall their own fact, and the shared vector file grows with every run.

Requirements: add packages/labs/src/shared/vector-store-lock.ts with withVectorStore(file, work, signal), so runs using the same libSQL vector file take turns within the process (cancellable while waiting). Run L24's store section under it, and delete the vectors the run wrote in finally (record written ids per index in the runtime's vector wrapper, additive). Add a regression test with several waves of 8 concurrent L24 runs that fails without the lock. Document in COMPATIBILITY.md and RELEASE-GATES.md that a libSQL vector file must not be shared across processes.

Definition of done: the concurrency regression test passes repeatedly; the e2e suite no longer flakes on L24.

First create an OpenSpec change named fix-lab-24-vector-concurrency with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
