# Proposal

## Why

Interactive approvals (change `interactive-run-approvals`) left two open issues:

1. **A paused run holds a slot.** A run waiting for a human holds one of the `MAX_CONCURRENT_RUNS` execution slots, although it does no work. A few unanswered approvals can block every other learner's run.
2. **Anyone with the run id can act.** Anyone who learns a run id (from logs, the URL bar or a screenshot) can approve or cancel that run.

## What Changes

- **Approval capacity:**
  - Runs waiting for approval no longer count towards `MAX_CONCURRENT_RUNS`.
  - A separate cap, `MAX_PENDING_APPROVALS` (default 20), bounds how many runs may wait at once.
  - When the cap is reached, a new approval request is auto-declined immediately with `by: "limit"`. This is fail-safe: the side effect does not run.
  - In-flight work stays bounded by `MAX_CONCURRENT_RUNS + MAX_PENDING_APPROVALS`.
- **Run token:**
  - `POST /api/labs/:labId/runs` returns a random `runToken` (256 bits, base64url) alongside `runId`. It is never included in snapshots, events or logs.
  - `POST /api/runs/:runId/cancel` and `POST /api/runs/:runId/approvals/:approvalId` require header `X-Run-Token`. A missing or wrong token gets 403 `FORBIDDEN`; an unknown run still gets 404.
  - The token is compared in constant time.
  - Read endpoints (snapshot, events) stay keyed by run id only. That is unchanged and documented.
- **Contracts:** `ApiErrorCode` gains `FORBIDDEN`. `StartRunResponse` gains `runToken`. `approval-resolved.by` gains `limit`.
- **Web:** the run hook keeps the token in memory for the current run only and sends it on cancel and approval decisions.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `lab-contracts`: canonical errors gain `FORBIDDEN`
- `lab-execution`: start returns a run token; mutating run endpoints require it; approval capacity

## Impact

- **Code:** `packages/contracts`, `packages/lab-engine/src/runner.ts`, `apps/api` (config, errors, routes), `apps/web/src/api/runs.ts`, `apps/web/src/features/run/useLabRun.ts`.
- **API clients:** this is a breaking change for any client that cancels without the token. The only client is our web app, which is updated in the same change. The README documents the header.
