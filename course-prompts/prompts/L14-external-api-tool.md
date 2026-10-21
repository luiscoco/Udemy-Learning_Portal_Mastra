# L14 — External API tool

**Module:** 03 Tools and Function Calling · **Step 21 of 88** · **OpenSpec change:** `lab-14-external-api-tool`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L13](L13-multiple-tools.md) · Next: [L15](L15-safe-tool-execution.md)

## Copy-ready prompt

Implement L14 (lab-14) — "External API tool" in Module 03 (Tools and Function Calling) of the existing Mastra Udemy Learning Platform.

Technical implementation: Add a server-side public-data fetch tool with timeouts, allowlist and local mock for offline mode.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Mock mode succeeds offline; failure and rate limits handled.

First create an OpenSpec change named lab-14-external-api-tool with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
