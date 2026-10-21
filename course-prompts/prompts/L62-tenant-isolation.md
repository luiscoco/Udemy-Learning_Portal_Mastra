# L62 — Tenant isolation

**Module:** 13 Security and Reliability · **Step 74 of 89** · **OpenSpec change:** `lab-62-tenant-isolation`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L61](L61-authenticated-api.md) · Next: [L62a](L62a-tenant-isolation-for-migrated-stores-and-browser-storage.md)

## Copy-ready prompt

Implement L62 (lab-62) — "Tenant isolation" in Module 13 (Security and Reliability) of the existing Mastra Udemy Learning Platform.

Technical implementation: Enforce ownership scopes across threads, documents, runs and storage records.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Cross-tenant negative tests pass across all routes.

First create an OpenSpec change named lab-62-tenant-isolation with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
