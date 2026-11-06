# platform/deployment Specification

## Purpose
Define how the platform is configured, packaged and checked for deployment: a validated configuration with secrets from files and production rules, liveness and readiness endpoints, and a container image with Docker secrets proven by a CI smoke test.

## Requirements

### Requirement: Validated deployment configuration
The API SHALL validate its configuration at startup, accept every secret from an environment variable or a `_FILE` path, and refuse to start in production without a production identity provider, a session secret, an audit key and a data directory, exiting with a message that names the missing keys and never prints secret values.

#### Scenario: Missing secret in a container
- **WHEN** the production container starts without AUTH_SESSION_SECRET
- **THEN** the process exits with a non-zero code and stderr names AUTH_SESSION_SECRET and AUTH_SESSION_SECRET_FILE

#### Scenario: Secrets from files
- **WHEN** AUTH_SESSION_SECRET_FILE points to a readable file
- **THEN** its trimmed content is used and the secret source is reported as file

### Requirement: Health and readiness
The API SHALL expose liveness at /api/health and readiness at /api/ready; readiness SHALL check the data directory, storage, the web bundle when served, provider keys in live mode and the runner, and SHALL answer 503 when any check fails.

#### Scenario: Read-only data directory
- **WHEN** the data directory is not writable
- **THEN** /api/ready answers 503 with the data-dir check failed while /api/health answers 200

### Requirement: Container packaging
The repository SHALL provide a Dockerfile that runs the API and web bundle as a non-root user with a data volume and a health check, a compose file using Docker secrets, and a CI job that builds the image and runs a smoke test proving start-up, readiness, a signed-in streamed run and the missing-secret failure.

#### Scenario: Container smoke test
- **WHEN** CI builds the image and runs the smoke test
- **THEN** the container becomes ready, a password login succeeds, a lab run streams to completion, and the missing-secret container exits with a clear message

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

### Requirement: Browser response and transport protection
API-served responses SHALL include a content security policy and browser headers that restrict script sources, framing, MIME sniffing and unnecessary device permissions while preserving supported course UI behavior. Strict transport security SHALL be sent only on trusted HTTPS requests. An explicit HTTPS-required option MUST refuse insecure application requests without redirecting credentials, while local HTTP remains compatible by default. Health/readiness GET probes are exempt.

#### Scenario: Serve a course workspace
- **WHEN** the bundled application serves a workspace, API response or error
- **THEN** security headers are present and same-origin course scripts, styles, audio and SSE continue to work

#### Scenario: HTTPS enforcement behind a trusted proxy
- **WHEN** HTTPS-required mode is enabled and a trusted proxy reports HTTPS
- **THEN** the request is accepted with transport protection, while an insecure request is refused

### Requirement: Explicit cross-origin policy
The API SHALL validate an optional single trusted origin and authorize credentialed cross-origin responses and preflights only for that exact origin. Other origins MUST NOT receive permissive CORS headers or bypass unsafe-request origin checks. Preflight methods and headers SHALL be allowlisted, and proxy trust SHALL remain explicit.

#### Scenario: Allowed origin request
- **WHEN** a browser sends a permitted preflight and then an authenticated request from the configured origin
- **THEN** the preflight and response include exact credentialed origin headers and normal authentication/ownership rules still apply

#### Scenario: Untrusted origin or header
- **WHEN** an untrusted origin or unsupported preflight header is presented
- **THEN** the request is refused without permissive CORS headers or executing an action

### Requirement: Durable deployment presets
Maintained deployment examples SHALL enable persistent sessions and execution records with separate stable secret files and a persistent data directory. Secret generation SHALL avoid overwriting existing keys and use owner-only file permissions where supported. Examples MUST preserve local-only defaults or explicitly configured HTTPS proxy boundaries.

#### Scenario: Generate local container secrets twice
- **WHEN** the operator generates secrets again for an existing deployment
- **THEN** existing signing and journal keys remain unchanged and no secret value is logged except the newly generated login password shown once
