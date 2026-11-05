# Proposal

## Why

Course progress currently belongs to one browser, so changing devices or losing browser storage loses the learner's completion state, notes and quiz history. The next release milestone is to make the authenticated account the durable home for this data while retaining offline editing and existing records.

## What Changes

- Add authenticated progress read, save, reset and legacy-import APIs with shared schemas and typed SDK coverage.
- Persist full progress records in a versioned, tenant-scoped local database with optimistic revisions and durable deletion markers.
- Use a server-backed progress adapter in the web app with a persistent offline queue, visible synchronization status, retry and explicit conflict resolution.
- Import browser-only progress without overwriting existing account records or resurrecting reset records, and retain an exportable device backup.
- Verify process restart, device/account isolation, stale request protection, migration, offline recovery and concurrent edits.

## Capabilities

### New Capabilities

- `platform/learner-progress`: durable account-scoped learning progress and safe synchronization.

### Modified Capabilities

- `lesson-workspace`: authenticated progress survives browser/device changes; guest and existing lesson completion behavior remain supported.

## Impact

Changes contracts, API storage/routes, client SDK, the web progress adapter and status component, tests and operational documentation. Adds a direct API dependency on the already-locked `@libsql/client` 0.18.0; no Mastra upgrade or provider calls. Existing lab implementations, public routes and synchronous ProgressStore consumers remain compatible. Durable sessions, HTTP run recovery, production quotas and shared multi-replica storage remain separate milestones.
