# Tasks

## 1. Implementation

- [x] 1.1 Extend `shared/tool-stream.ts`: `consumeStream`, `tool-call-approval` → pending approvals + suspended step, `tool-output-denied` → denied tool-finish; verify existing lab tests stay green
- [x] 1.2 Policy module: role allowlist, `requireApproval` refund tool, policy check, idempotent mock ledger, append-only audit trail; verify unit tests
- [x] 1.3 Lab 15 run (Mastra registration, approve/decline loop), definition, fixtures, solution; verify lab15.test.ts and conformance (approve, decline, viewer blocked, over-limit, unregistered tool)

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e` and live check (approve and decline against a real model)

## Workflow follow-up

- Archive, commit and push.
