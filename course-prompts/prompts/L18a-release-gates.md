# L18a — Release gates

**Module:** 04 Agent Configuration and Context · **Step 29 of 92** · **OpenSpec change:** `docs-release-gates`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L18](L18-context-aware-tools.md) · Next: [L19](L19-execution-options.md)

## Copy-ready prompt

Implement platform follow-up L18a — "Release gates".

Why: the platform runs locally with no authentication until L61, keeps progress in the browser and stores data in local files. Those limits are fine for a course on one machine but must be visible before anyone exposes it publicly.

Requirements: add docs/RELEASE-GATES.md, a checklist of what must be done before public exposure, grouped as access control, durable state, hosting hardening, code execution and dependencies, each item ☐ or ☑ with the lab that addresses it (authentication L61, tenant isolation L62, durable persistence L71, deployment L72–L73). Link it from the README. Run npm audit; upgrade dev tools such as OpenSpec to a patched exact version when that removes advisories, and record the remaining advisories and their source in docs/COMPATIBILITY.md instead of forcing incompatible upgrades.

Definition of done: the document exists and is linked; every later lab that closes a gate updates it; verify passes after any upgrade.

First create an OpenSpec change named docs-release-gates with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
