# L15 — Safe tool execution

**Module:** 03 Tools and Function Calling · **Step 23 of 91** · **OpenSpec change:** `lab-15-safe-tool-execution`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L14](L14-external-api-tool.md) · Next: [L15a](L15a-interactive-human-approval-during-runs.md)

## Copy-ready prompt

Implement L15 (lab-15) — "Safe tool execution" in Module 03 (Tools and Function Calling) of the existing Mastra Udemy Learning Platform.

Technical implementation: Implement allowlisted tools, policy checks, confirmation for side effects, audit trail and denial.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Unauthorized tool blocked; approved mock side effect runs once.

First create an OpenSpec change named lab-15-safe-tool-execution with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
