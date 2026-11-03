# L50 — Multi-server MCP agent

**Module:** 10 Model Context Protocol · **Step 63 of 92** · **OpenSpec change:** `lab-50-multi-server-mcp-agent`

Original course prompt. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L49](L49-expose-mastra-over-mcp.md) · Next: [L51](L51-two-collaborating-agents.md)

## Copy-ready prompt

Implement L50 (lab-50) — "Multi-server MCP agent" in Module 10 (Model Context Protocol) of the existing Mastra Udemy Learning Platform.

Technical implementation: Connect local calculator and data servers with namespaces and collision policies.

Student experience: provide a 5–10 sentence explanation of the concept, 3–5 learning objectives, prerequisite lab links, a meaningful interactive task with real editable inputs, an example input and expected output, Learn/Run/Source tabs, event trace and result inspection, 3 progressive hints, common mistakes, challenge, 3–5-question quiz, automated validation checks and a concise 3–7-minute instructor demonstration script.

Integration and correctness: use official version-matched Mastra APIs or clearly identified custom wrappers; isolate secrets to the API; provide offline mocked fixture and optional user-configured live mode; add runtime Zod schemas, timeout/cancellation handling, typed errors, Vitest unit/integration tests and Playwright happy-path test; register in catalog and route without changing previously completed lessons. For multi-step or costly interactions record bounded run budget and useful event annotations.

Definition of done: Calls route to correct server; one offline server does not crash whole lab.

First create an OpenSpec change named lab-50-multi-server-mcp-agent with proposal, delta specifications, technical design and tasks. Review current codebase and Mastra docs, implement change, execute the relevant tests, and summarize actual proof of completion and known limitations. Do not replace real results with fabricated demo success.
