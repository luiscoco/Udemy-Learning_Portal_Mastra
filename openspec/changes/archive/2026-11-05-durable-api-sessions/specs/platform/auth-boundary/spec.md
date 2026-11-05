## ADDED Requirements

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
