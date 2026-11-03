# L10 — Failures, retries and limits

**Module:** 02 Agent Generation and Streaming · **Step 18 of 92** · **OpenSpec change:** `lab-10-failures-retries-and-limits`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L09](L09-structured-json-generation.md) · Next: [L11](L11-first-custom-tool.md)

## Copy-ready prompt

Implement L10 (lab-10) — "Failures, retries and limits" in Module 02 (Agent Generation and Streaming) of the existing Mastra Udemy Learning Platform.

Technical implementation: Show retryable versus non-retryable errors, budgets, timeout, exponential backoff for idempotent calls.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Deterministic fault injection produces expected retry counts and bounded failures.

First create an OpenSpec change named lab-10-failures-retries-and-limits with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
