# Proposal

## Why

The L71 definition of done: "Introduce production-capable persistence adapter/migrations/backups for progress, threads, documents and runs. Restart and migration integration tests pass; retention strategy documented."

What the platform does today:

- **Progress** lives in the browser's localStorage.
- **Runs** live in the runner's process memory and disappear on restart.
- **Threads** are Mastra memory threads in per-lab libSQL files (L21).
- **Documents** live in the course library files (L36).

Nothing has versioned migrations, backups or a retention policy.

Findings from a spike with `@libsql/client` 0.18.0, `@mastra/libsql` 1.26.2 and `@mastra/core` 1.78.0:

- **Transactions.** `client.transaction('write')` commits or rolls back DDL and data together, and `PRAGMA user_version` is transactional.
- **Snapshots.** `VACUUM INTO ?` writes a consistent snapshot of a WAL-mode database that includes committed WAL frames, and `PRAGMA integrity_check` returns `ok`.
- **One file for everything.** `LibSQLStore.init()` creates only `mastra_*` tables, so app tables (`app_*`) and Mastra memory threads can share one SQLite file. That file is then a single backup and restore unit.
- **Thread APIs.** `memory.listThreads({ filter: { resourceId } })`, `getThreadById` and `recall` read threads back after the file is reopened.

## What Changes

- **New lab `lab-71` (Module 15): Durable production persistence.** It is an app-level adapter, explicitly labelled as such; Mastra provides storage adapters but not app migrations or backups.
  - **`store.ts`:** `openDurableStore(file)` opens one libSQL file with WAL, `busy_timeout` and `foreign_keys`. It has typed repositories for progress, documents and runs; threads go through Mastra `Memory` on the same file.
  - **`migrations.ts`:** forward-only numbered migrations with SHA-256 checksums, recorded in `app_schema_migrations`.
    - Each migration runs in its own write transaction.
    - Checksum drift is refused, and so is a database newer than the code.
    - A failure rolls back, so the version stays unchanged.
    - There are three migrations: v1 progress and runs; v2 documents; v3 a progress column with backfill and a run index.
  - **`backup.ts`:**
    - `backup()` writes a `VACUUM INTO` snapshot plus a manifest (SHA-256, bytes, schema version, row counts) and rotates old backups.
    - `verifyBackup()` re-hashes, runs the integrity check and recounts.
    - `restore()` verifies first, then replaces the database atomically (temp file plus rename) with every client closed.
  - **`retention.ts`:** a policy (run age in days, runs kept per lab, backups kept). `sweep()` deletes expired runs in one transaction and reports counts. Progress, threads and documents are kept until the learner deletes them.
  - **The run** walks through: migrate → write (progress, a document imported from the learner's own library or a sample, a run record, a memory thread turn) → restart (close every client and reopen the file) → verify → backup → restore drill → retention. Each phase is a `workflow-step` event.
    - **Inputs:** start from an empty database or use your durable one; target version; inject a failure into migration 3; retention days; backups to keep; model.
    - **Modes:** offline (a scripted agent turn) and live (a real model writes the thread turn).
  - **Tests:**
    - migration integration tests: v1 data migrated to v3 intact, rollback on failure, drift refused, downgrade refused;
    - a real two-process restart test (L21 pattern);
    - backup, restore and retention tests.
- **`docs/RETENTION.md`:** the documented retention and backup strategy (what is kept, how long, and how to restore).
- No contract, catalog-order or existing-lab changes besides registering lab-71.
