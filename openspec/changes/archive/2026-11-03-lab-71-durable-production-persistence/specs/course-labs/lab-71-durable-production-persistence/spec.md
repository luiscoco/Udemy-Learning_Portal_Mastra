## ADDED Requirements

### Requirement: Versioned migrations
Lab 71 SHALL apply forward-only numbered migrations, each in its own transaction with a recorded checksum, keep existing data intact, refuse checksum drift and databases newer than the code, and leave the schema version unchanged when a migration fails.

#### Scenario: Migrating data from v1 to v3
- **WHEN** a database at version 1 holding progress and runs is migrated to version 3
- **THEN** every existing row is still present, the new column is backfilled, and the recorded version is 3

#### Scenario: A failing migration
- **WHEN** migration 3 fails part-way
- **THEN** the transaction rolls back, the version stays at 2, and no partial schema change remains

### Requirement: Durable data across restarts
Progress, documents, runs and Mastra memory threads SHALL be stored in one durable file and SHALL be readable by a new process after the writing process has exited.

#### Scenario: Process restart
- **WHEN** one process writes progress, a document, a run and a thread turn and exits, and a new process opens the same file
- **THEN** the new process reads back the same rows and recalls the thread messages in order

### Requirement: Verified backups and restore
The lab SHALL create consistent snapshot backups with a manifest, verify them by hash, integrity check and row counts before restoring, restore atomically, and keep only the configured number of backups.

#### Scenario: Restore drill
- **WHEN** a verified backup is restored into a drill file
- **THEN** the drill file has the backup's schema version and row counts, and the learner's live database is unchanged

#### Scenario: Corrupted backup
- **WHEN** a backup's bytes no longer match its manifest hash
- **THEN** restore is refused with a clear error

### Requirement: Documented retention
Runs SHALL expire by age and by a per-lab cap in one transactional sweep, while progress, threads and documents are kept until the learner deletes them; the strategy SHALL be documented in docs/RETENTION.md.

#### Scenario: Retention sweep
- **WHEN** the sweep runs with a 30-day policy over runs older and newer than 30 days
- **THEN** only the expired runs are deleted and the sweep reports how many
