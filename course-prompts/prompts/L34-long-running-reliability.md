# L34 — Long-running reliability

**Module:** 07 Advanced Workflows · **Step 46 of 91** · **OpenSpec change:** `lab-34-long-running-reliability`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L33](L33-human-approval.md) · Next: [L35](L35-business-process-capstone.md)

## Copy-ready prompt

Implement L34 (lab-34) — "Long-running reliability" in Module 07 (Advanced Workflows) of the existing Mastra Udemy Learning Platform.

Technical implementation: Add state persistence, idempotency keys, transient failure recovery and retries with workflow state.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Crash-recovery fixture avoids duplicate operations.

First create an OpenSpec change named lab-34-long-running-reliability with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
