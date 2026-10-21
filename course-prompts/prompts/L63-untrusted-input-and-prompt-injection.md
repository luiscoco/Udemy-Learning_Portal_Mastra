# L63 — Untrusted input and prompt injection

**Module:** 13 Security and Reliability · **Step 76 of 89** · **OpenSpec change:** `lab-63-untrusted-input-and-prompt-injection`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L62a](L62a-tenant-isolation-for-migrated-stores-and-browser-storage.md) · Next: [L63a](L63a-prompt-injection-gateway-write-budget-and-negated-requests.md)

## Copy-ready prompt

Implement L63 (lab-63) — "Untrusted input and prompt injection" in Module 13 (Security and Reliability) of the existing Mastra Udemy Learning Platform.

Technical implementation: Demonstrate malicious retrieved text treated as data; test prompt-injection defenses and limits.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Injected tool instructions cannot trigger unapproved side effects.

First create an OpenSpec change named lab-63-untrusted-input-and-prompt-injection with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
