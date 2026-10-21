# L17 — Request context

**Module:** 04 Agent Configuration and Context · **Step 26 of 89** · **OpenSpec change:** `lab-17-request-context`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L16](L16-dynamic-instructions.md) · Next: [L18](L18-context-aware-tools.md)

## Copy-ready prompt

Implement L17 (lab-17) — "Request context" in Module 04 (Agent Configuration and Context) of the existing Mastra Udemy Learning Platform.

Technical implementation: Pass validated tenant/user/request metadata using current documented request-context mechanism.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Agent and tool receive only allowlisted context; injection attempt ignored.

First create an OpenSpec change named lab-17-request-context with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
