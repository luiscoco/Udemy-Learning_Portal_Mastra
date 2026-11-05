# Design

## Context

The synchronous ProgressStore abstraction already isolates lesson components from storage. ProgressRecord contains notes, prediction, self-check, quiz and completion flags; L71's demonstration progress table stores only a subset and cannot replace this contract. The API already partitions services by verified principal. @libsql/client 0.18.0 is installed and locked; its transaction declarations and official Turso reference support the existing local-file deployment. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** Durable full records, safe migration, responsive local editing, explicit conflicts and account isolation without changing lab routes or UI completion rules.

**Non-Goals:** Certification/authorization from self-reported completion, durable login sessions, HTTP run/approval recovery, remote database deployment or multi-replica hosting. Scratchpad notes remain under their existing browser scope.

## Decisions

1. Add a dedicated `platform-progress.db` in the authenticated learner's existing storage partition. Do not couple production data to a lesson's partial demo tables. Use a checksummed v1 migration, transactional compare-and-set revisions, tombstones for resets and short-lived database clients closed after each operation. Serialize per file inside the API process; local SQLite locking still bounds cross-process writers.
2. Preserve ProgressRecord. Add versioned entry/snapshot/write/reset/import schemas with finite record/map limits. New APIs use GET and POST to fit the SDK's existing transport. Import accepts at most ten records per bounded request and inserts only previously absent ids, including respecting tombstones. Server timestamps and derived status replace client claims. Progress remains learner-owned tracking, not a security credential.
3. Require an expected-subject header, encoded by the SDK and compared to the verified principal before any data access. It never selects a storage owner. This closes the cookie/account-switch window where an old queue might otherwise send data under a new session. Abort controllers and generation guards also reject late responses in the web adapter.
4. Implement a new adapter behind the synchronous store interface. Keep guest behavior and the legacy v1 data intact. A separate collision-free per-subject v2 cache holds revisions, tombstones and a persistent coalescing outbox. Fetch account state, import missing legacy entries in batches, overlay pending edits, then flush sequentially. Updates typed during an in-flight save retain their own sequence and use its acknowledged revision.
5. Fail closed on revision conflict: retain the device draft, fetch the server version and ask the learner to choose. Never merge prose by timestamps or silently overwrite newer notes. Network errors preserve the queue, expose Retry and recover on online/focus events. Storage failures remain visible; do not claim offline persistence if localStorage rejects a write.
6. Show a small accessible progress status component with saved/pending/offline/conflict states, resolution controls and a device-backup download. Use only the typed SDK for HTTP. Existing unit render helpers retain MemoryProgressStore; dedicated tests inject the remote adapter.

## Risks / Trade-offs

- Local SQLite remains single-replica storage → document the existing hosting boundary and back up the entire data volume; test recovery in a distinct process.
- Whole-record revision conflicts can affect independent fields → explicit choice keeps semantics understandable and avoids hidden data loss; field-level merging can be a later migration.
- Shared E2E learner cookies now share progress → isolate progress-sensitive tests with registered test accounts instead of clearing shared server data during parallel runs.
- Legacy records may differ from account records → account entries win import, original browser data remains exportable, and pending v2 edits require explicit conflict resolution.

## Migration Plan

Deploy additive contracts/routes and the new adapter together. The new database is created on first authenticated access; no lab data moves. Legacy browser records remain intact and import idempotently. The v2 cache/outbox retains unsent edits across reloads. Rollback can use the v1 browser adapter while keeping the new databases and caches for recovery; do not delete them. Sessions still require sign-in after a process restart.
