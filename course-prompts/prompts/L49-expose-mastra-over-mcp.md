# L49 — Expose Mastra over MCP

**Module:** 10 Model Context Protocol · **Step 61 of 89** · **OpenSpec change:** `lab-49-expose-mastra-over-mcp`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L48](L48-mcp-resources-and-prompts.md) · Next: [L50](L50-multi-server-mcp-agent.md)

## Copy-ready prompt

Implement L49 (lab-49) — "Expose Mastra over MCP" in Module 10 (Model Context Protocol) of the existing Mastra Udemy Learning Platform.

Technical implementation: Create narrowly scoped MCP server façade for selected safe Mastra tool functionality.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: External MCP client can discover/call allowlisted tool.

First create an OpenSpec change named lab-49-expose-mastra-over-mcp with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
