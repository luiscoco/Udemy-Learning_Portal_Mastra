# Design

## Context

See proposal.md. `packages/auth/SessionManager` is synchronous and used by Lab 61; the Express boundary owns its instance. The API already directly depends on exact libSQL 0.18.0 for learner progress. Deployment configuration already handles `AUTH_SESSION_SECRET_FILE`, masks secrets and requires stable secrets in production.

## Goals / Non-Goals

Goals: preserve teaching interfaces and HTTP contracts, make configured API sessions durable with shared revocation, and test actual processes rather than merely reopening a repository.

Non-goals: remote databases, general multi-replica readiness, identity-provider additions, shared rate limiting, live-provider work, new token formats, idle-expiry refresh, run recovery and browser offline-tab coordination.

## Decisions

1. Add explicit `AUTH_SESSION_STORE=memory|sqlite` with memory as the compatibility default. SQLite mode requires the existing configured secret; never generate a process-local key for durable mode. Validate this in the deploy profile and API constructor. This avoids silently invalidating every restart or persisting a new unconfigured credential.
2. Extract reusable opaque-cookie creation/verification helpers in `packages/auth`, leaving its synchronous SessionManager intact. API sessions expose an awaitable interface and optional prior-session rotation. The Express middleware and mutation routes await verification and writes; server startup awaits storage initialization. No frontend changes or browser credential storage.
3. Use `<effectiveDataDir>/auth/sessions.db`, separate from tenant lab databases. Apply an immutable checksummed v1 migration in a write transaction. Serialize file operations inside the process and use the installed client's connection-wide `timeout` for SQLite lock contention. Close every transaction/client. Persistent initialization and operations never silently fall back.
4. Persist SHA-256 session-ID hashes, bounded principal JSON, absolute timestamps, a keyed identity-configuration fingerprint and a record HMAC. Cookies still carry random 256-bit IDs with an HMAC. Database rows cannot be replayed as cookies; altered principals/expiry fail validation. Fingerprints include the active provider's normalized credentials/allowlist and TTL; unrelated provider keys do not affect sessions.
5. Create and rotation purge expired rows and evict the oldest sessions to a 10,000-row cap transactionally. Rotation requires the prior live row to be deleted in the same transaction before insert; a stale concurrent rotation fails. Logout deletes durably. Every verification reads storage; no positive cache can bypass revocation. Already-open SSE streams retain the existing request-start authorization semantics.
6. Keep normal tests on memory mode. Add deterministic persistent tests with temporary data directories, injected clocks and real API processes. A browser scenario owns its bundled API child, keeps its cookie across restart, restores account progress, and verifies logout remains effective after another restart. It runs offline on desktop/mobile.

## Risks / Trade-offs

- SQLite files require a shared local persistent volume and bounded lock contention; they are not a remote multi-replica session service. Document this boundary and test two processes sharing the same file.
- Credential changes invalidate all sessions for that identity configuration rather than only one user; fail closed and document the intentional re-login requirement.
- Every authenticated request reads durable storage; avoid an unsafe positive cache and retain bounded records. A future remote adapter can implement the same awaitable interface.
- Database/key backups can restore old authentication state; restore with a newly rotated signing secret to prevent revoked cookies from becoming valid again.

## Migration Plan

Deploy additive configuration/code. Existing memory sessions are not copied: enabling durable mode requires one login. Set the stable signing secret and persistent data volume before selecting sqlite. Keep all participating processes on identical identity settings. Roll back by selecting memory; previous durable cookies are then unrecognized. Rotating the key is the explicit invalidation procedure; never restore an older database with its old signing secret.
