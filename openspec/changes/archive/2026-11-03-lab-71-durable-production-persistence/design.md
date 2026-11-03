# Design

## Storage layout

- **One file.** There is one libSQL file per learner, `lab-71-durable.db` in their partition (L62), opened via `ctx.services.memory.file()`.
- **Fresh mode** uses a scratch file under `files('lab-71')/<runId>.db`, deleted after the run, so a learner can watch v0 → v3 without touching their durable store.
- **Tables:**
  - **App tables:** `app_schema_migrations`, `app_progress`, `app_documents` (v2), `app_runs`.
  - **Mastra tables:** `mastra_threads`, `mastra_messages`, and the rest of the `mastra_*` set, created by `LibSQLStore.init()` on the same file.

## Migrations

```ts
interface Migration { version: number; name: string; statements: string[] }
checksum = sha256(name + statements.join(';\n'))
```

- **`migrate(client, { target, failAt })`:**
  1. Read `app_schema_migrations`.
  2. Refuse with `MIGRATION_DRIFT` if an applied checksum differs from the code.
  3. Refuse with `DB_NEWER_THAN_CODE` if the applied version is above the latest version in the code.
  4. Apply pending migrations up to the target, each in a write transaction that inserts its row and sets `PRAGMA user_version`.
  5. `failAt` injects an error after the migration's first statement. Rollback is then proven by `user_version` and the table list.
- **Errors** are `LabError('VALIDATION_FAILED' | 'CONFLICT')` with a clear message. The run reports a refused migration as a failed check, not as a crash.

## Backups

- **Snapshot:** `VACUUM INTO '<dir>/<iso>-v<n>.db'`.
- **Manifest:** `<same>.json`, holding `{ file, sha256, bytes, schemaVersion, counts, createdAt }`.
- **Rotation** keeps the newest `backupsKeep` snapshots.
- **Restore:**
  1. Verify the snapshot (sha256, `integrity_check`, counts).
  2. Close the clients, copy it to `<db>.restore-tmp`, then rename over `<db>`; remove the `-wal`/`-shm` files first.
  3. Reopen and recount.
- **The restore drill** restores into a separate drill file, so the learner's live data is never replaced by the lab.

## Retention

| Data | Policy |
| --- | --- |
| Runs | Kept for `retentionDays` (default 30) and at most 20 per lab and owner. |
| Progress, threads, documents | Kept until the learner deletes them. |
| Backups | The last `backupsKeep` (default 7). |

`sweep(now)` runs in one transaction and returns the deleted counts. The strategy is written up in `docs/RETENTION.md`.

## Restart

- **In the lab:** close the Mastra store and the app client, then reopen both on the same file and read everything back.
- **In the tests:** a child-process worker writes the data and exits; a new process reads it back and also verifies the backup (the L21 pattern).

## Concurrency and safety

- **Locking:** a `KeyedLock` per partition serialises runs on one durable file, and `busy_timeout` is 5 s.
- **Paths** come only from services (never from input).
- **Limits:** input numbers are bounded; document text is capped at 20 000 characters.
- **Cleanup:** clients are closed in `finally`.

## UI

The generic form presentation: inputs, the timeline with phase steps, output JSON and checks. No new contract is needed.
