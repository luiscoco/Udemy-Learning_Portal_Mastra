# Retention and backup strategy

This page describes what the platform keeps, for how long, and how backups are made and restored. The reference implementation is Lab 71 (`packages/labs/src/lab-71/`). It is an app-level layer on Mastra storage: Mastra provides the libSQL storage adapter and migrates its own `mastra_*` tables, while the app migrates its `app_*` tables, makes the backups and applies retention.

## Where data lives

Each learner's data sits in their own storage partition, `.data/memory/tenants/<partition>/` (L62). The partition name is a hash of the owner id; raw identities never appear in paths.

In the L71 model, a single SQLite file holds all four kinds of data, so one snapshot captures all of them consistently:

| Data | Tables |
| --- | --- |
| Progress | `app_progress` |
| Documents | `app_documents` |
| Run records | `app_runs` |
| Agent threads and messages | Mastra memory: `mastra_threads`, `mastra_messages` |

> **Today's platform:** progress is kept in the browser (localStorage). Threads and documents are kept per lab, as L21 memory files and the L36 library. Runs are kept in memory and are lost on restart. L71 is the target model. Moving the platform's own stores onto it is a deployment step (L72–L73), and it must use the same migration rules.

## Retention

| Data | Kept | Removed by |
| --- | --- | --- |
| Run records | 30 days after they finish (`runDays`), and at most 20 per lab and learner (`runsPerLab`) | `sweep()` in `retention.ts`, in one transaction |
| Progress | Until the learner deletes it | Learner action only |
| Threads and messages | Until the learner deletes the thread | Learner action only (for example, deleting a chat thread in L67) |
| Documents | Until the learner deletes them | Learner action only |
| Backups | The newest 7 snapshots (`backupsKeep`) | Rotation after each backup |
| Lab scratch databases | Until the end of the run | Best-effort cleanup. On Windows a file can stay locked until the process exits; folders older than 10 minutes are removed by later runs. |

**Why the policies differ:**

- Run records are operational logs. They grow with every click, and they are only useful for debugging and dashboards.
- Learner-owned data (progress, conversations, uploaded documents) must never disappear without a decision by the learner.

**Changing the policy:** change `DEFAULT_RETENTION` and this page together. The sweep is safe to run at any time and is idempotent.

## Migrations

Migrations follow these rules:

- **Forward-only:** a migration is never changed once applied. To change the schema, add a new migration.
- **Numbered** in `MIGRATIONS` (`migrations.ts`).
- **Checksummed:** each applied migration is recorded in `app_schema_migrations` with a SHA-256 of its statements.
- **Transactional:** each migration commits together with its history row and `PRAGMA user_version`, or not at all. A failure leaves the previous version intact.

The migrator refuses to run (with `CONFLICT`) in three cases:

- an applied migration was edited (checksum drift);
- the database is newer than the code (deploy the newer code instead);
- the target version is below the current one (going backwards).

**Run migrations at startup, before serving traffic.** With several instances, run them from one instance or from a release step.

## Backups

1. **Snapshot.** `VACUUM INTO '<backups>/<ISO time>-v<schema>.db'` takes a consistent snapshot of the live database (WAL mode), including committed WAL frames. Never copy a live `.db` file directly.
2. **Manifest.** A manifest `<snapshot>.json` records the SHA-256, size, schema version and row counts per data kind.
3. **Verify.** `verifyBackup()` re-hashes the file, runs `PRAGMA integrity_check` and recounts the rows against the manifest. A corrupted snapshot is refused.
4. **Store off the machine.** In production, copy verified snapshots to separate storage (an object store) with its own retention. A backup on the same disk does not survive the loss of that disk.

## Restore

**When:** this is an offline maintenance step. Run it with the server stopped, so nothing has the database open.

1. Stop the API.
2. Pick the snapshot and run `verifyBackup()`. If it fails, pick an older snapshot.
3. Run `restore()`. It copies the snapshot to a temporary file, removes the stale `-wal`/`-shm` files and renames the copy over the database in one atomic step.
4. Start the API. Migrations bring an older snapshot up to the current schema.
5. Check that the row counts match the manifest.

**Practise it:** run the restore drill (Lab 71) regularly. It restores into a separate file and compares that file with the manifest, without touching live data. A backup that has never been restored is not a backup.
