# L15b — Run tokens and approval capacity

**Module:** 03 Tools and Function Calling · **Step 25 of 92** · **OpenSpec change:** `run-tokens-and-approval-capacity`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L15a](L15a-interactive-human-approval-during-runs.md) · Next: [L16](L16-dynamic-instructions.md)

## Copy-ready prompt

Implement platform follow-up L15b — "Run tokens and approval capacity".

Why: after L15a, a run waiting for a human holds an execution slot although it does no work, so a few unanswered approvals block every learner. And anyone who learns a run id (logs, URL bar, screenshot) can approve or cancel that run.

Requirements:
- Runs waiting for approval do not count towards MAX_CONCURRENT_RUNS. A separate MAX_PENDING_APPROVALS cap (default 20) bounds waiting runs; beyond it a new request is auto-declined at once with by: "limit".
- POST /api/labs/:labId/runs returns a random 256-bit runToken (base64url) next to runId, never included in snapshots, events or logs. Cancel and approval endpoints require header X-Run-Token: missing or wrong → 403 FORBIDDEN, unknown run → 404. Compare tokens in constant time.
- Contracts: ApiErrorCode gains FORBIDDEN, StartRunResponse gains runToken, approval-resolved.by gains limit. The web run hook keeps the token in memory for the current run only.

Definition of done: tests for slot accounting, the cap, missing/wrong/correct tokens and token redaction pass; the README documents the header.

First create an OpenSpec change named run-tokens-and-approval-capacity with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
