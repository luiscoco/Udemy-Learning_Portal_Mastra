# L65 — Timeouts and failure testing

**Module:** 13 Security and Reliability · **Step 78 of 88** · **OpenSpec change:** `lab-65-timeouts-and-failure-testing`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L64](L64-tool-approval-policies.md) · Next: [L66](L66-react-client-integration.md)

## Copy-ready prompt

Implement L65 (lab-65) — "Timeouts and failure testing" in Module 13 (Security and Reliability) of the existing Mastra Udemy Learning Platform.

Technical implementation: Simulate slow models, flaky tools, provider outages and cancellation; add circuit/retry boundaries.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: No hung UI; bounded retries; failing dependency isolated.

First create an OpenSpec change named lab-65-timeouts-and-failure-testing with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
