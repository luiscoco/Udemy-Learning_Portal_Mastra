# L21 — Persistent message history

**Module:** 05 Conversational Memory · **Step 32 of 91** · **OpenSpec change:** `lab-21-persistent-message-history`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L20](L20-input-and-output-processing.md) · Next: [L22](L22-threads-and-user-boundaries.md)

## Copy-ready prompt

Implement L21 (lab-21) — "Persistent message history" in Module 05 (Conversational Memory) of the existing Mastra Udemy Learning Platform.

Technical implementation: Configure supported durable Mastra memory storage, inspect chronological history and restart persistence.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Thread context survives process restart in integration tests.

First create an OpenSpec change named lab-21-persistent-message-history with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
