# dev-foundation Specification

## Purpose
Reproducible monorepo install, scripts, validated configuration, secret isolation and CI.

## Requirements

### Requirement: Reproducible install
The repository SHALL install from a clean clone using the committed lockfile with exact dependency versions and a supported Node.js LTS version (>= 22.13).

#### Scenario: Clean install
- **WHEN** a developer runs `npm ci` on a fresh clone with Node 24
- **THEN** all workspaces install without modifying `package-lock.json`

### Requirement: Standard scripts
The root package SHALL expose `dev`, `build`, `lint`, `typecheck`, `test` and `test:e2e` scripts that operate across all workspaces.

#### Scenario: Dev start
- **WHEN** a developer runs `npm run dev`
- **THEN** the API listens on the configured port and the web dev server serves the app with `/api` proxied to the API

#### Scenario: Quality gates
- **WHEN** CI runs lint, typecheck, test and build
- **THEN** each command exits with status 0 on the main branch

### Requirement: Validated server configuration
The API SHALL validate environment configuration at startup and refuse to start on invalid values, reporting the invalid key names without printing secret values.

#### Scenario: Invalid port
- **WHEN** `PORT` is set to a non-numeric value
- **THEN** startup fails with a message naming `PORT`

#### Scenario: Secret masked
- **WHEN** configuration is logged or returned in diagnostics
- **THEN** any provider API key is shown only as a masked value (for example `sk-…abcd` or `not set`)

### Requirement: Secrets never reach the client
Provider credentials SHALL be read only by the API process; the built web bundle MUST NOT contain server environment variable names holding secrets or their values.

#### Scenario: Bundle scan
- **WHEN** the bundle-secret check runs after `npm run build`
- **THEN** it fails if any configured secret value or secret key name appears in `apps/web/dist`
