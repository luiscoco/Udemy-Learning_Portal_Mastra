# L18 — Context-aware tools

**Module:** 04 Agent Configuration and Context · **Step 27 of 88** · **OpenSpec change:** `lab-18-context-aware-tools`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L17](L17-request-context.md) · Next: [L18a](L18a-release-gates.md)

## Copy-ready prompt

Implement L18 (lab-18) — "Context-aware tools" in Module 04 (Agent Configuration and Context) of the existing Mastra Udemy Learning Platform.

Technical implementation: Implement a tool reading request-scoped role/locale to format output safely.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Tool produces locale-specific results without cross-session contamination.

First create an OpenSpec change named lab-18-context-aware-tools with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
