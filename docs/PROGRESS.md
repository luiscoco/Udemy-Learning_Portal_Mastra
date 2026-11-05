# Account progress and offline recovery

Signed-in progress is stored on the API, including completion flags, quizzes, notes, predictions and self-checks. Sign in from another browser to recover it. Guest progress stays on the current browser and is eligible for import when the first learner signs in, matching the established guest-claim behavior.

The progress notice says when an edit is saved to the account. If the progress service is unavailable, edits remain in an account-scoped browser outbox and retry when the browser reconnects or regains focus. **Retry progress sync** retries manually. Restoring private cached progress after reload still requires a verified session; this does not add an offline app shell or offline authentication. If browser storage is unavailable, keep the tab open until the account save succeeds; the UI explicitly reports that it cannot keep an offline copy.

## Migration and conflicting edits

Old `mlp.progress.v1` records remain intact. Missing account records import in batches of at most ten; existing account records and reset markers win. **Download device backup** exports the original device records. The new `mlp.progress.v2:<encoded subject>` cache contains server revisions and queued edits, scoped to the exact account identity.

When another device changes the same lab, the stale edit is kept locally. **Use saved progress** discards that device draft for the lab. **Keep this device’s changes** explicitly saves it against the latest observed revision; another intervening edit can still produce a new conflict. Notes are never silently merged by timestamps. Reset removes the record while retaining a versioned tombstone, so old imports cannot restore it.

## HTTP contract

All routes require a valid session and `X-Progress-Subject: <encodeURIComponent(principal.sub)>`. The subject header is an account-binding precondition, not authorization and not a storage destination: the server always selects the tenant from the verified session. Missing or mismatched subjects return 404; anonymous callers return 401. Responses use `Cache-Control: no-store`.

| Route | Body / response |
| --- | --- |
| `GET /api/progress` | `{ entries: [{ labId, revision, record, updatedAt }] }`; `record: null` is a reset marker |
| `POST /api/progress/:labId` | `{ baseRevision, record }` → stored entry |
| `POST /api/progress/:labId/reset` | `{ baseRevision }` → tombstone entry |
| `POST /api/progress/import` | `{ records: [...] }` (1–10 unique labs) → account snapshot; insert-only and idempotent |

Use `api.progress.get/save/reset/import` in `@mlp/client`. A new record uses revision 0; stale writes/resets return 409 without changing data. Subjects/owners in request bodies are refused. Unknown/unavailable lab ids are rejected. Single-record JSON requests are bounded at 256 KiB; imports at 2 MiB. Notes/predictions retain their established character limits; maps and batches are bounded. Status and quiz pass are derived server-side, but progress remains learner-reported tracking, not a certificate or access-control credential.

## Persistence and operations

Each tenant has a dedicated `platform-progress.db` under `MLP_DATA_DIR/memory/tenants/<partition>/`, with full JSON records, revisions and tombstones. A checksummed, transactional v1 migration runs before the tenant's first operation. Unknown newer schemas and altered migration checksums are refused. Clients/transactions close after every operation; writes are serialized per tenant inside the API process.

Back up the persistent data volume, including these progress databases. Use a consistent SQLite snapshot rather than copying a live WAL database. Deleting a browser cache is no longer a progress reset: use the lesson's reset control. Do not delete server tombstones or rewrite applied migrations. The v1 browser records are retained for rollback/recovery; no lab memory or document stores are moved by this change.

This supports the existing single-replica deployment with a persistent volume. In default memory session mode, sign in again after an API restart. Configured [durable sessions](SESSIONS.md) preserve valid cookies across restart; progress then restores without another login. Remote shared authentication and general multi-replica storage remain separate release gates. No provider calls are required for progress synchronization.

Use one editing tab per account while offline. Multiple tabs share the browser cache/outbox; coordinating simultaneous offline drafts across tabs remains future work. Revision checks protect writes from separate devices, but do not coordinate localStorage writes between tabs.
