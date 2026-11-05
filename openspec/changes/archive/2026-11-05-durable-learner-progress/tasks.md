# Tasks

## 1. Durable API and contracts

- [x] 1.1 Add bounded progress request/response schemas and revision contracts; verify validation and normalization tests.
- [x] 1.2 Implement tenant-scoped storage, checked migrations, CAS writes, tombstones and import; verify competing-write, migration, reset/reimport and distinct-process recovery tests.
- [x] 1.3 Add authenticated account-bound API routes and typed SDK methods; verify route audit, contract coverage, malformed input and cross-account refusal; document HTTP behavior.

## 2. Learner synchronization

- [x] 2.1 Implement account-scoped cache/outbox, guarded hydration, idempotent migration and sequential sync; verify offline reload, stale responses, updates during save and account-switch tests.
- [x] 2.2 Add accessible status/retry/conflict/backup controls and integrate the adapter; verify conflict choices and preservation of guest/lesson behavior; document migration and recovery.

## 3. Integration verification

- [x] 3.1 Isolate progress-sensitive browser fixtures and add fresh-browser, offline, account-isolation and conflict scenarios; verify desktop/mobile Playwright coverage.
- [x] 3.2 Run npm run verify and npm run test:e2e, resolve actual failures and record results, costs and remaining release gates.

## Workflow follow-up

- Sync both delta specs after successful verification, archive the change and verify strict main-spec validation.
