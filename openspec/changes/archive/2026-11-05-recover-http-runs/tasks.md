# Tasks

## 1. Durable engine boundary

- [x] 1.1 Add bounded recovery contracts and optional synchronous persistence/capability hooks; verify existing engine behavior, hash privacy, persistence ordering and failure-abort tests; document interface boundaries.
- [x] 1.2 Implement exact-version SQLite journal, checked migrations, integrity chains, single-runner exclusion, retention and interruption finalization; verify rollback, tampering, capacity, migration, competing processes and no-reexecution restart tests; document keys and backups.

## 2. API and SDK integration

- [x] 2.1 Add validated configuration, startup/disposal wiring, owner-only listing/recovery endpoints and typed SDK methods; verify route audit, authentication, token privacy, retained snapshots/SSE and stale approval conflicts; document HTTP migration and activation.

## 3. Browser recovery

- [x] 3.1 Add account-scoped noncredential run pointers, guarded standard-tab reattachment/latest recovery and accessible failure/reset controls; verify replay deduplication, account switching, blocked storage, cancel and approval recovery; document specialized-presentation boundaries.
- [x] 3.2 Add desktop/mobile reload and actual process restart scenarios; verify interrupted pending approvals never execute side effects and retained terminal output restores; record demo and recovery instructions.

## 4. Integration verification

- [x] 4.1 Run npm run verify and npm run test:e2e sequentially, resolve actual failures and record changed files, commands, results, costs and remaining release gates.

## Workflow follow-up

- Sync both delta specs, archive after successful verification and validate main specifications strictly.
