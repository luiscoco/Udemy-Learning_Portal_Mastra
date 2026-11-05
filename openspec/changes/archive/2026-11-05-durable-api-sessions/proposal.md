# Proposal

## Why

Account progress is now durable, but authenticated learners must sign in after every API restart and logout cannot be shared between processes. Add an explicitly configured persistent session backend while retaining the established cookie and local teaching interfaces.

## What Changes

- Add `AUTH_SESSION_STORE=memory|sqlite`, defaulting to the existing memory mode for compatibility. SQLite mode requires a configured stable `AUTH_SESSION_SECRET` (including its mounted-file form).
- Store bounded, expiring sessions in a versioned API-owned database under the data volume, using hashed opaque IDs, record integrity checks and identity-configuration binding.
- Make verification, logout and login rotation use durable state with no positive authentication cache; rotation is atomic and revocation survives restarts and is visible to another process.
- Preserve the cookie attributes, HTTP schemas, lab routes and synchronous teaching-session manager. Document configuration, migration, recovery and remaining production gates.
- Verify restart recovery through distinct API processes and a browser, cross-instance logout/rotation, expiry, tampering, storage failure, migration integrity and credential/configuration changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `platform/auth-boundary`: configured durable sessions survive restarts, share revocation and fail closed on invalid persistent state.

## Impact

Changes API authentication/storage, additive deployment configuration, shared cookie helpers, tests and operations documentation. Uses the already-pinned `@libsql/client` 0.18.0; no new dependencies, Mastra APIs, provider calls or frontend credential storage. Memory sessions remain the default and retain their restart behavior. Durable mode requires the same database, signing secret and identity configuration on each participating process. This does not make lab data multi-replica safe or add OIDC, shared login rate limits, idle-expiry refresh, run recovery or offline cross-tab coordination.
