# L72 — Configuration and packaging

**Module:** 15 Production and Capstone · **Step 89 of 92** · **OpenSpec change:** `lab-72-configuration-and-packaging`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L71](L71-durable-production-persistence.md) · Next: [L73](L73-deploy-application.md)

## Copy-ready prompt

Implement L72 (lab-72) — "Configuration and packaging" in Module 15 (Production and Capstone) of the existing Mastra Udemy Learning Platform.

Technical implementation: Add validated deployment config, Dockerfiles, health/readiness endpoints, secrets setup and observability config.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Containers start; missing secret fails clearly; health checks reflect dependencies.

First create an OpenSpec change named lab-72-configuration-and-packaging with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
