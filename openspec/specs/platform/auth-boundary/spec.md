# platform/auth-boundary Specification

## Purpose

Protect the learning platform's Express API with verified learner sessions and run ownership, while refusing unsafe deployment of its development identity provider and keeping credentials server-side.

## Requirements

### Requirement: Authenticated lab execution
The API SHALL refuse to start, read, cancel or decide on a lab run without a valid session, and SHALL bind every run to the learner who started it.

#### Scenario: Anonymous run start
- **WHEN** a request without a session posts to `/api/labs/:labId/runs`
- **THEN** the response is 401 with code `UNAUTHORIZED`, and no run is created

#### Scenario: Another learner's run
- **WHEN** learner B requests learner A's run or its events
- **THEN** the response is 404, as for an unknown run

### Requirement: Development-safe login
The development identity provider SHALL accept only allowlisted users, SHALL run only on a loopback host, and SHALL be refused in production.

#### Scenario: Production configuration
- **WHEN** the API starts with `NODE_ENV=production` and the development provider
- **THEN** startup fails with a message naming the missing production identity provider

#### Scenario: Failed login
- **WHEN** an unknown user or a wrong passcode is submitted
- **THEN** the response is 401 with the same generic message in both cases, and repeated attempts are rate-limited (429)

### Requirement: Credentials not leaked
Session credentials SHALL travel only in an `HttpOnly`, `SameSite=Strict` cookie and SHALL never appear in response bodies or logs.

#### Scenario: Login response
- **WHEN** a login succeeds
- **THEN** the body contains the principal but not the session value, the cookie is `HttpOnly; SameSite=Strict; Path=/api`, and the logs contain neither the session value nor the passcode

#### Scenario: Tampered or revoked session
- **WHEN** the cookie signature is altered, the session expired, or the learner logged out
- **THEN** the request is treated as anonymous

### Requirement: Configured durable sessions
The API SHALL support explicitly configured persistent sessions with a stable server signing secret. A valid, unexpired session SHALL survive process restart and work on another API process using the same session storage, secret and identity configuration. Memory mode SHALL remain compatible. Persistent mode without a stable secret MUST be refused.

#### Scenario: Restart with the same configuration
- **WHEN** a learner signs in using persistent mode and the API restarts with the same data and configuration
- **THEN** the existing browser cookie authenticates without another login

#### Scenario: Missing durable signing secret
- **WHEN** persistent mode is selected without a configured signing secret
- **THEN** startup is refused without printing secret values

### Requirement: Durable session lifecycle
Persistent logout and login rotation SHALL commit revocation before reporting success. Revocation SHALL be visible to subsequent requests on another process and after restart. Rotation MUST create a new session and revoke the old one atomically. Expiry SHALL remain absolute and session storage SHALL be bounded.

#### Scenario: Logout through another instance
- **WHEN** a session is logged out through one API process
- **THEN** the same cookie is refused by subsequent requests on another process and after restart

#### Scenario: Concurrent rotation
- **WHEN** two operations rotate the same live session concurrently
- **THEN** at most one rotation commits and the original session is revoked

#### Scenario: Expired session after restart
- **WHEN** a stored session's absolute expiry passes before restart
- **THEN** the cookie is treated as anonymous and reading it does not extend its lifetime

### Requirement: Protected persistent authentication state
Persistent storage SHALL contain no replayable session credentials. Session integrity and active identity configuration SHALL be checked before accepting stored claims. Changing the signing secret or active identity credentials MUST invalidate earlier sessions. Invalid or unavailable storage MUST fail closed without falling back to memory or disclosing credentials.

#### Scenario: Tampered stored claims
- **WHEN** a stored principal or expiry is altered without a valid integrity proof
- **THEN** the session is refused

#### Scenario: Changed identity configuration
- **WHEN** an allowlist, credential or session policy changes
- **THEN** previously issued sessions are refused under the new configuration

#### Scenario: Storage failure or incompatible migration
- **WHEN** persistent storage is unavailable or its migration history is incompatible
- **THEN** authentication does not succeed through cached or fallback state and the error contains no credential values
