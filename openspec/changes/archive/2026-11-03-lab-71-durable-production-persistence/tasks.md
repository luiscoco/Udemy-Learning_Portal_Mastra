# Tasks

## 1. Persistence adapter
- [x] 1.1 `store.ts`: open the file (WAL, busy_timeout, foreign_keys), repositories for progress, documents and runs, Mastra memory on the same file
- [x] 1.2 `migrations.ts`: three checksummed migrations, transactional apply, drift and downgrade refusal, injected failure
- [x] 1.3 `backup.ts`: VACUUM INTO snapshot, manifest, verify, rotation, atomic restore
- [x] 1.4 `retention.ts`: policy and transactional sweep

## 2. Lab
- [x] 2.1 `run.ts`: phases with workflow-step events, fresh or durable store, restart, restore drill, checks
- [x] 2.2 `definition.ts`, `fixtures.ts`, `solution.md`; register in the catalog and the labs registry
- [x] 2.3 `docs/RETENTION.md` and a COMPATIBILITY row

## 3. Tests
- [x] 3.1 Migration integration tests (v1 → v3 with data, rollback, drift, downgrade)
- [x] 3.2 Two-process restart test
- [x] 3.3 Backup, restore and retention tests; generic e2e; live check
