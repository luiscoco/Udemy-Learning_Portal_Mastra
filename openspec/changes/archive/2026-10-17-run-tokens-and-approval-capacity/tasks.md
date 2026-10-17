# Tasks

## 1. Contracts and engine

- [x] 1.1 `FORBIDDEN` error code, `StartRunResponse.runToken`, `approval-resolved.by: limit`; verify contract tests
- [x] 1.2 Waiting runs excluded from the active count; `maxPendingApprovals` with immediate `limit` decline; run token generation and `authorize`; verify runner tests

## 2. API and web

- [x] 2.1 `MAX_PENDING_APPROVALS` config; start returns `runToken`; cancel and approvals require `X-Run-Token` (403 / 404); verify API tests
- [x] 2.2 Web client sends the token on cancel and decisions; verify web tests

## 3. Verification

- [x] 3.1 `npm run verify`, `npm run test:e2e`, live check

## Workflow follow-up

- Archive, commit and push.
