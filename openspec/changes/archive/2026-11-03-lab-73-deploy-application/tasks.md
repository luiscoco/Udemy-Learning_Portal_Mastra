# Tasks

## 1. Deployment
- [x] 1.1 `scripts/deploy-azure.ts`: idempotent resource setup, cloud build, Container App YAML, release log, rollback
- [x] 1.2 `scripts/staging-smoke.ts`: TLS, redirect, health and readiness, cookie flags, SSE streaming, persistence across a restart
- [x] 1.3 `docs/DEPLOY.md`: environment setup, SSL, SSE, rollback, costs, teardown, limits

## 2. Staging evidence
- [x] 2.1 Deploy to Azure Container Apps and run the staging smoke test (with a restart)
- [x] 2.2 Rollback drill with the release log

## 3. Lab 73
- [x] 3.1 Release simulator (offline) and live staging probe; registry and catalog
- [x] 3.2 Tests, verify, e2e, live check
