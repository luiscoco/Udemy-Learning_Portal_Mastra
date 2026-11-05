# Design

## Context

See proposal.md. LabRunner has synchronous start/event methods used throughout the course; API routes directly wrap them. `useLabRun` holds a capability only in memory. `libsql` 0.5.29 is already installed transitively; its version-matched declarations/reference and an ignored local spike verified synchronous transactions, rollback and exclusive locking. Keep Mastra and existing contracts intact.

## Goals / Non-Goals

Goals: restore retained outcomes and live standard-tab controls without replaying code, protect owner/capability metadata, and bound persistent storage. Preserve synchronous engine consumers and memory defaults.

Non-goals: arbitrary continuation serialization, exactly-once external actions, distributed runners, active chat-bubble reattachment, new workflow persistence, and transparent migration of old memory runs. Existing chat/workspace histories remain supported. Recovery must explicitly explain uncertain side effects after interruption.

## Decisions

1. Add `RUN_STORE=memory|sqlite` (default memory) and separate `RUN_STORE_SECRET`, required and at least 32 characters for sqlite, with existing mounted-file/secret masking support. Separate journal signing from session keys so rotating authentication does not invalidate retained results. Add exact direct API dependency `libsql` 0.5.29 without upgrading the installed native stack.
2. Use a synchronous RunPersistence interface in the framework-independent engine. Persist initial metadata before calling lab code, and event/snapshot transactions before broadcasting. Hash capabilities with SHA-256; retain the original hash plus four recent recovery hashes. Optional hooks preserve all current memory users. Persisted storage failures abort execution; if even the compact terminal failure cannot be committed, report an explicit uncertain storage failure in memory and reject further journal access until repaired/restarted.
3. Use `<dataDir>/runs/executions.db` and a separate SQLite lock database. Hold an exclusive transaction on the lock connection for the runner's lifetime; process death releases the OS lock. A second runner fails before touching execution records. Use documented Database/exec/prepare/transaction/close methods, WAL and FULL synchronization for the execution database, and checked immutable migrations. No remote/multi-replica claim.
4. Store owner, token hashes, snapshot, byte count and HMAC-protected event-chain tip; each event has a keyed chain tag. Verify metadata before selecting an owner and event sequence/integrity before replay. Store no raw inputs or credentials. Bound event data at 8 MiB per run plus a small terminal reserve, at most 5,008 events, 100 retained runs globally, 20 per owner, and 24-hour terminal retention. Never evict active work to admit another run; prune on startup/new starts and periodic sweep.
5. Startup atomically appends an interruption error and failed complete event to orphaned running records and clears actionable approvals. It does not synthesize approval-resolved decisions or invoke lab code. Lazy terminal hydration serves existing snapshot/SSE routes. Native L32/L33 workflow snapshots can still be explicitly resumed through their established labs, independent of the abandoned HTTP continuation.
6. Add owner-only GET `/api/runs?labId=...` (fixed bounded results) and POST `/api/runs/:runId/recover` returning `{ snapshot, runToken }`. Recovery never puts capabilities in storage on the browser, snapshots, events or logs. Multiple recovered tabs do not invalidate the original starter's capability. Update route audit and typed SDK contracts.
7. Standard Run tabs remember only the selected run ID in account/lab-scoped sessionStorage. Reattach after verified identity is ready, replay via the existing SSE reducer, and offer an explicit latest-run recovery control. Abort/generation guards discard stale work on reset/unmount/account changes. Reset clears the pointer, not server history. A reattached live run records its new completion; replaying a historical terminal run is read-only so it cannot undo a deliberate progress reset. Pending approvals are actionable only while a run is live. Specialized chat/workspace presentations retain existing history controllers and can use the API separately.

## Risks / Trade-offs

- Synchronous commits add per-event I/O latency; the course's bounded local execution model and opt-in mode make this explicit. A future asynchronous/distributed engine requires a different interface/version.
- Interrupted executions may already have performed actions; never resume automatically or label them safely retryable. Show a verify-before-repeating message.
- A missing or changed journal secret makes signed history unreadable; require consistent protected key/database backups and document rotation/retirement separately from session key rotation.
- Browser reload must reconnect within the existing grace period to keep a live run; slower recovery restores its cancellation outcome. Do not lengthen production timeouts to hide failed recovery tests.
- Retention is bounded history, not audit anchoring or certification; deleting/restoring a consistent database/key pair remains an operator trust boundary.

## Migration Plan

Deploy additive routes/contracts/UI and configured storage together. Existing memory mode remains unchanged; standard tabs can recover still-live memory runs after reload. Select sqlite with a stable separate key and persistent volume for restart history. Stop the old runner before starting the new one. Roll back to memory without deleting the journal; its durable records are unavailable until compatible mode/key are restored. Never copy a live database without a consistent SQLite backup.
