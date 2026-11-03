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
