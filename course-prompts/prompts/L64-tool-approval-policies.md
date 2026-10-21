# L64 — Tool approval policies

**Module:** 13 Security and Reliability · **Step 78 of 89** · **OpenSpec change:** `lab-64-tool-approval-policies`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L63a](L63a-prompt-injection-gateway-write-budget-and-negated-requests.md) · Next: [L65](L65-timeouts-and-failure-testing.md)

## Copy-ready prompt

Implement L64 (lab-64) — "Tool approval policies" in Module 13 (Security and Reliability) of the existing Mastra Udemy Learning Platform.

Technical implementation: Build role-based policies and explicit human confirmation for write-capable tools.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Denied actions never invoked; audit log captures decisions.

First create an OpenSpec change named lab-64-tool-approval-policies with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
