# Spec Delta

## MODIFIED Requirements

### Requirement: Standard scripts
The root package SHALL expose `dev`, `build`, `lint`, `typecheck`, `test` and `test:e2e` scripts that operate across all workspaces. The development command MUST wait for API readiness before starting the web server, bound startup waiting, and stop its companion process when either command exits.

#### Scenario: Dev start
- **WHEN** a developer runs `npm run dev`
- **THEN** the API listens on the configured port and the web dev server serves the app with `/api` proxied to the API

#### Scenario: Slow API startup
- **WHEN** the API takes longer than Vite to initialize
- **THEN** the terminal reports that it is waiting and the web server starts only after the readiness endpoint reports ready

#### Scenario: API unavailable
- **WHEN** the API never becomes ready or its readiness request hangs
- **THEN** development startup fails within its bounded waiting interval with a sanitized message directing the learner to API logs and configuration, and the companion process stops

#### Scenario: Configured API port
- **WHEN** the API host or port is configured, or an explicit API_PROXY_TARGET is supplied
- **THEN** the readiness check and development proxy use the same resolved origin without copying provider values from configuration files into the web environment

#### Scenario: Quality gates
- **WHEN** CI runs lint, typecheck, test and build
- **THEN** each command exits with status 0 on the main branch
