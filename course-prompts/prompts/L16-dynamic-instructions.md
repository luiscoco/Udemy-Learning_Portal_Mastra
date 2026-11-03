# L16 — Dynamic instructions

**Module:** 04 Agent Configuration and Context · **Step 26 of 91** · **OpenSpec change:** `lab-16-dynamic-instructions`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L15b](L15b-run-tokens-and-approval-capacity.md) · Next: [L17](L17-request-context.md)

## Copy-ready prompt

Implement L16 (lab-16) — "Dynamic instructions" in Module 04 (Agent Configuration and Context) of the existing Mastra Udemy Learning Platform.

Technical implementation: Use request-scoped settings for tone/persona and locale without shared state leaks.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Parallel test requests preserve independent instructions.

First create an OpenSpec change named lab-16-dynamic-instructions with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
