## ADDED Requirements

### Requirement: Repeatable staging deployment
The repository SHALL provide an idempotent deployment script for Azure Container Apps that builds the image in the cloud tagged with the commit, configures HTTPS ingress, secrets, a persistent data volume and health probes, records each release, and can roll back to the previous release.

#### Scenario: Rollback
- **WHEN** the operator runs the deployment script with --rollback
- **THEN** the app runs the previous release's image again and answers ready before the script reports success

### Requirement: Staging smoke test
A staging smoke test SHALL verify against the deployed URL that TLS is valid and HTTP redirects to HTTPS, health and readiness answer 200, session cookies are Secure, HttpOnly and SameSite=Strict, a run streams incrementally over SSE, and durable data survives a restart.

#### Scenario: Persistence across a restart
- **WHEN** the smoke test writes a durable note, restarts the revision and runs again
- **THEN** the second run recalls the first note and applies no migrations
