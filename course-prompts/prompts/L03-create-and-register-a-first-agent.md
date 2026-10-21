# L03 — Create and register a first agent

**Module:** 01 Mastra Foundations · **Step 8 of 89** · **OpenSpec change:** `lab-03-create-and-register-a-first-agent`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L02](L02-explore-project-architecture.md) · Next: [L04](L04-model-and-instructions.md)

## Copy-ready prompt

Implement L03 (lab-03) — "Create and register a first agent" in Module 01 (Mastra Foundations) of the existing Mastra Udemy Learning Platform.

Technical implementation: Define a named agent using current Agent API and register it in Mastra, keeping model provider configurable.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Invocation returns text with a stubbed model in tests; agent lookup by id succeeds.

First create an OpenSpec change named lab-03-create-and-register-a-first-agent with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
