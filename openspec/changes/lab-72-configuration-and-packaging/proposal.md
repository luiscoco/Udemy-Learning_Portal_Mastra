# Proposal

## Why

The L72 definition of done: "Add validated deployment config, Dockerfiles, health/readiness endpoints, secrets setup and observability config. Containers start; missing secret fails clearly; health checks reflect dependencies."

Gaps found in the current platform:

- **No way to start in production.** The only identity provider is the development login. It is refused with `NODE_ENV=production` and on any non-loopback `HOST`, but a container must bind `0.0.0.0`. So a production container cannot start at all.
- **Missing secrets aren't caught.** The session secret and the audit key fall back to random per-process values, which silently log everyone out on restart and break multi-instance setups.
- **No readiness.** There is only `/api/health` (liveness). Nothing reports whether storage, the data directory or the providers are usable.
- **No container secrets.** Secrets can only come from environment variables, not from files (Docker or Kubernetes secrets).
- **No request logs, and no proxy setting.** Requests aren't logged, and nothing tells Express that a TLS-terminating proxy sits in front, which the same-origin check and secure cookies need.
- **No container image** and no container CI.
- **Local Docker is unavailable** on the development machine (no Docker, no WSL distribution). Container proof therefore runs in GitHub Actions (Docker on `ubuntu-latest`), and its result is read back and reported.

## What Changes

- **New server-only package `@mlp/deploy`.** It holds the config schema moved out of `apps/api/src/config.ts`, which now re-exports it (no behaviour change for existing keys). It adds:
  - **`resolveSecretFiles(env)`:** every secret `X` may come from `X_FILE`. Setting both, or pointing at a missing or empty file, fails and names the key, never the value.
  - **`deploymentProblems(config)`:** profile rules for production. A real identity provider is required (`AUTH_PROVIDER=password`, plus `AUTH_USERS`), and so are `AUTH_SESSION_SECRET`, `AUDIT_HMAC_KEY` and an absolute `MLP_DATA_DIR`; live mode needs at least one provider key.
  - **`loadDeployConfig(env)`:** the above combined, ending with one clear, value-free error.
  - **Readiness checks:** data dir writable, libSQL storage `SELECT 1` on a probe file, web bundle present, provider keys for live mode, runner accepting runs.
- **New production identity provider `PasswordIdentityProvider`** (`@mlp/auth`, `production: true`):
  - users come from `AUTH_USERS` as scrypt hashes;
  - verification is constant-time, with a dummy hash for unknown users;
  - `npm run auth:hash-user` creates an entry;
  - the session contract `login.kind` gains `password` (additive), and the login page labels the field "Password".
- **API additions:**
  - `GET /api/ready` returns 200 or 503 with the per-dependency checks (public; no paths or values);
  - `TRUST_PROXY` config;
  - `LOG_REQUESTS` JSON access logs with the request id, method, path without the query string, status and duration;
  - a typed `ReadinessResponseSchema`;
  - the client SDK `ready()` method;
  - the route class for the new route.
  - Startup prints `[config] Refusing to start…` and exits with code 78 when the config is invalid.
- **Packaging:**
  - a multi-stage `Dockerfile` (Node 24 bookworm-slim, non-root `node` user, `/data` volume, `HEALTHCHECK`, the API serving the web bundle on one origin) and `.dockerignore`;
  - `compose.yaml` with Docker secrets from `./secrets/*` (gitignored);
  - `scripts/make-secrets.mjs`;
  - `scripts/container-smoke.mjs`, which proves three things: the container starts and becomes ready; a missing secret makes it exit with a message naming the key; a read-only data volume turns readiness to 503 while liveness stays 200. It also signs in and streams a lab-00 run.
  - CI job `container` (after `verify`).
  - `docs/DEPLOYMENT-CONFIG.md`.
- **New lab `lab-72` (Module 15): "Configuration doctor".** The learner edits a deployment env (placeholders only; real-looking provider keys are refused) and picks a profile. The run validates it with the real `@mlp/deploy` rules, resolves the secret sources and evaluates readiness against a scratch data directory (with toggles that simulate failures).
  - **Offline:** no provider is called.
  - **Live:** a real, free provider authentication probe (OpenAI `GET /v1/models` or Anthropic `GET /v1/models`) with the server's key.
