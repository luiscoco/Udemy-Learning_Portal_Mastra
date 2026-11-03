# Proposal

## Why

The L73 definition of done: "Provide repeatable deployment to chosen backend host and frontend host with SSE support, SSL, environment setup and rollback notes. Smoke tests verify health, streaming and persistence in a staging deployment."

L72 produced a tested container image: in CI it starts, reports ready, streams runs, and fails clearly on a missing secret. Nothing deploys that image yet.

The owner chose **Azure Container Apps** in their subscription and asked to keep staging deployed afterwards, scaled to zero. The development machine has no Docker, so images are built in the cloud with `az acr build`.

Container Apps covers what we need:

- **HTTPS:** managed TLS on `*.azurecontainerapps.io`, with HTTP redirected to HTTPS.
- **Streaming:** Envoy ingress passes SSE through; the API's 15 s heartbeats stay within the ingress idle timeout.
- **Secrets** for the environment configuration.
- **Persistence:** Azure Files volumes for `/data`.
- **Rollback:** revisions, so we can roll back to an earlier image.

The frontend and backend are one origin: the API serves the built web app (L72). That keeps cookies `SameSite=Strict` and needs no CORS.

## What Changes

- **`scripts/deploy-azure.ts`** is a repeatable, idempotent deployment. It runs these steps through `az`:
  1. resource group;
  2. ACR Basic registry, then `az acr build` tagged with the git SHA;
  3. Log Analytics and the Container Apps environment;
  4. storage account with an Azure Files share mounted at `/data` (SMB, `nobrl` for SQLite byte-range locks, single replica);
  5. secrets: session secret, audit key and password users, generated once and kept in the gitignored `secrets/staging/`;
  6. the Container App: ingress external, target port 8787, HTTPS only, min 0 and max 1 replicas, liveness probe on `/api/health` and readiness probe on `/api/ready`, `TRUST_PROXY=1`, `MASTRA_MODE=offline`.

  It records each release (image tag, revision, time) in `secrets/staging/releases.json`. `--rollback` re-points the app to the previous release's image and waits until it is ready.
- **`scripts/staging-smoke.ts <url>`** runs these checks against the live staging URL:
  - TLS (an `https` fetch with a valid certificate) and the HTTP to HTTPS redirect;
  - `/api/health` 200, then `/api/ready` 200;
  - security headers: the cookie is `Secure; HttpOnly; SameSite=Strict`;
  - a password login;
  - SSE streaming of a lab-00 run, with the time to first token and incremental delivery checked (not buffered);
  - persistence: a lab-71 durable run, a revision restart, then a second run that recalls the first note and applies no migrations.
- **`docs/DEPLOY.md`:** the deployment steps, environment setup, TLS, SSE notes, rollback, costs, teardown, and the limits (single replica, SQLite on Azure Files).
- **New lab `lab-73` (Module 15): "Deploy application", a release simulator with health gates.**
  - **Offline:** the learner picks a release scenario (healthy, missing secret, failing readiness, slow start or broken streaming) and a rollout strategy (single revision / blue-green with traffic shift). The run then simulates build → push → new revision → readiness gate → traffic shift → post-deploy smoke, and rolls back automatically on failure, with `workflow-step` events.
  - **Live:** the server probes the configured `STAGING_URL` (server-side env only, never learner input, so there is no SSRF): health, readiness, TLS and SSE first byte.
  - **Checks:** no traffic ever reaches an unready revision; a failed release is rolled back; a healthy release passes the smoke test; the plan includes rollback.
