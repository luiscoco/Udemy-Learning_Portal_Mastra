# Proposal

## Why

The API now supports durable sessions and account progress, but reloads lose the current run/token and process restarts lose HTTP execution records. Recover recorded work without automatically repeating side effects or pretending that an in-memory approval continuation survived.

## What Changes

- Add opt-in `RUN_STORE=sqlite` with a separate stable `RUN_STORE_SECRET` (including its mounted-file form), a checked journal and an exclusive local runner lock. Memory remains the compatibility default.
- Commit owner-bound run metadata and redacted events before execution/broadcast, retain bounded history, and recover completed runs after restart. Mark interrupted runs failed, close unresolved approvals without fabricating decisions, and never rerun their code automatically.
- Add owner-only recent-run listing and capability recovery APIs, with typed SDK methods. Store token hashes only; retain the original capability and a bounded set of recovery capabilities in server state.
- Let standard Run tabs reattach after reload using only an account-scoped run ID in sessionStorage, with an explicit latest-run recovery control. Live runs retain cancellation/approval controls; archived results replay through the existing SSE contract.
- Verify engine lifecycle failures, rollback, restart interruption, event integrity, owner isolation, capability privacy, migration/retention, browser reload and actual process recovery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-execution`: bounded durable HTTP records, safe interruption and owner capability recovery.
- `lesson-workspace`: standard Run-tab reattachment without browser credential persistence.

## Impact

Changes engine persistence hooks, API run storage/routes/configuration, contracts, client SDK, the standard Run-tab controller, tests and operations docs. Makes already-installed `libsql` 0.5.29 a direct exact API dependency; no Mastra upgrade or invented native APIs. Existing routes, statuses and start-response fields remain compatible. Running/waiting executions become `failed` after a process restart with an explicit interruption message. This does not resume arbitrary code, implement exactly-once external side effects, add distributed execution, or replace L32/L33 native persisted workflow snapshots. Chat/workspace presentations keep their existing thread-history UI; their HTTP records are available through the same recovery API, while live bubble reattachment is outside this milestone.
