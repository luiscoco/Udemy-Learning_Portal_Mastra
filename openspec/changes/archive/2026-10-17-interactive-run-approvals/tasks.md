# Tasks

## 1. Contracts and engine

- [x] 1.1 `approval-request` / `approval-resolved` events, `ApprovalDecisionRequestSchema`, `RunSnapshot.pendingApprovals`; verify contract tests
- [x] 1.2 `ctx.requestApproval`, `runner.resolveApproval`, deadline pause/resume, approval timeout, abort wiring; verify runner tests (approve, conflict, timeout, cancel while waiting, deadline paused)

## 2. API and web

- [x] 2.1 `POST /api/runs/:runId/approvals/:approvalId` with Zod validation and 404/409 mapping; verify API tests
- [x] 2.2 Run state, client `decideApproval`, approval panel, timeline rows; verify reducer and component tests

## 3. Lab 15

- [x] 3.1 `userDecision: ask` via `ctx.requestApproval`; `by` recorded in approvals and audit; verify lab15 tests in ask mode

## 4. Verification

- [x] 4.1 `npm run verify`, `npm run test:e2e` (interactive approve and decline in the browser), live check

## Workflow follow-up

- Archive, commit and push.
