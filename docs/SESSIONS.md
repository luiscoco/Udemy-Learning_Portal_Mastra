# Durable API sessions

Set these server-only settings in the ignored root `.env` or deployment configuration:

```dotenv
AUTH_SESSION_STORE=sqlite
# Set a stable random AUTH_SESSION_SECRET (at least 32 characters), or mount it with AUTH_SESSION_SECRET_FILE.
# Mount MLP_DATA_DIR on a persistent local volume; production requires an absolute path.
```

Keep the secret in your existing secret store; never paste it into source or browser configuration. SQLite mode refuses to start without it. `memory` remains the compatibility default and loses sessions on restart. Enabling SQLite requires one login; existing in-memory sessions are not migrated. No API provider keys or calls are needed.

The API stores sessions in `<MLP_DATA_DIR>/auth/sessions.db` (default data root: `.data`). The existing `mlp_session` cookie retains `HttpOnly; SameSite=Strict; Path=/api` and production `Secure`. It remains an opaque random ID plus HMAC; neither the frontend nor response bodies receive it. Persistent rows contain ID hashes and integrity-protected claims, not replayable cookie values.

Expiry is absolute, with the existing TTL (default eight hours, at most seven days). Reads do not extend it. Expired records are removed during lifecycle operations, and the oldest sessions are evicted when creating a session would exceed 10,000 records. Login rotates atomically; logout commits deletion before returning success. Each request verifies durable storage, so another process observes revocation on its next request. An already-open SSE stream keeps the existing request-start authorization behavior.

All participating processes must use the same database file, signing secret, TTL and active identity configuration. Changing the signing secret, active provider, its allowlist/credentials or TTL invalidates previous sessions. Changing provider API keys does not. Storage failures and incompatible/altered migrations fail closed; there is no memory fallback.

Back up this database consistently with SQLite and protect it as authentication data. Restore with a newly rotated signing secret so an old snapshot cannot restore revoked credentials. Do not edit applied migrations. Selecting memory is a rollback option that requires another login; retain the database until recovery decisions are complete.

This is an application-level adapter using the installed libSQL client. It does not add OIDC/SSO, idle-expiry refresh, shared login rate limits, durable HTTP runs or general multi-replica hosting. Local SQLite storage requires bounded lock contention and a supported persistent filesystem; it is not a remote session service. Lab 61 retains its explicit in-memory teaching implementation.

Security references: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and the [official libSQL client reference](https://docs.turso.tech/sdk/ts/reference). Installed interfaces are checked against `@libsql/client` 0.18.0; no dependency upgrade is required.
