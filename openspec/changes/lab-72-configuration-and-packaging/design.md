# Design

## `@mlp/deploy` (server only, consumed as TS source and bundled into the API)

- **`schema.ts`:** `ConfigSchema` (the existing keys, moved verbatim) plus these new keys:

  | Key | Type | Default |
  | --- | --- | --- |
  | `AUTH_PROVIDER` | `dev` \| `password` | — |
  | `AUTH_USERS` | secret | — |
  | `MLP_DATA_DIR` | string | — |
  | `TRUST_PROXY` | `false` \| `true` \| `1`–`5` \| `loopback` | `false` |
  | `LOG_REQUESTS` | boolean | `true` |

  It also exports `parseConfig`, `ConfigError(keys)`, `secretValues`, `describeConfig` (masked) and `SECRET_KEYS`.
- **`secrets.ts`:** `resolveSecretFiles(env, readFile)`. It returns a new env plus the source of each secret (`env` | `file` | `unset`). A `X_FILE` value is read and trimmed. It errors on both being set, on an unreadable file and on an empty file.
- **`profile.ts`:** `deploymentProblems(config)` returns `{ key, message }[]`, and `loadDeployConfig(env, { readFile })` throws `ConfigError` with every problem. Messages name keys and the `_FILE` alternative, never values.
- **`readiness.ts`:**
  - **`ReadinessProbe`** is built with an injected config and paths. `check()` runs the checks below and returns the contract shape, caching it for 2 s.
  - **Checks:**
    - `data-dir`: write, then delete a probe file.
    - `storage`: one long-lived libSQL client on `<data>/memory/ready-probe.db`, running `SELECT 1` with a 2 s timeout.
    - `web-bundle`: only when `WEB_DIST_DIR` is set.
    - `providers`: in live mode at least one key is set; otherwise skipped.
    - `runner`: not draining.
  - **Simulation:** checks accept a `simulate` set, used only by the lab.
  - **`close()`** closes the probe client.

## Auth

- **`PasswordIdentityProvider({ users })`:**
  - entry format: `name:scrypt$N$r$p$salt$hash`, with base64url salt and hash;
  - parameters: N=2^14, r=8, p=1, keylen 32;
  - `production = true`, `passwordRequired = true`;
  - principal: `sub: password:<name>`.
- **`createAuth`** picks the provider from `AUTH_PROVIDER`; `assertSafeAuthConfig` is unchanged.
- **`scripts/hash-user.mjs <name>`** reads the password from `AUTH_HASH_PASSWORD` or stdin.

## API

- **`server.ts`:** `loadDeployConfig(process.env)`. On error it prints `[config] Refusing to start (NODE_ENV=…): <problems>` and exits with code 78 (EX_CONFIG).
- **`app.ts`:**
  - `app.set('trust proxy', …)`;
  - an access log on response finish;
  - `GET /api/ready` → probe; 503 when any check fails;
  - the probe is closed on shutdown.
- **Contracts:** `ReadinessResponseSchema { status: 'ready'|'not-ready', checks[{ name, status: ok|fail|skip, message, durationMs }], timestamp }`; `SessionResponse.login.kind` adds `password`.
- **Client SDK:** `ready()` treats a 503 as data, not as an error.

## Packaging

- **Dockerfile.**
  - **Build stage:** `npm ci`, then `npm run build`, then `npm prune --omit=dev`.
  - **Runtime stage:**
    - copies `/app` (workspace symlinks, the lab sources read by the Source tab, the dists);
    - `ENV NODE_ENV=production HOST=0.0.0.0 MLP_DATA_DIR=/data WEB_DIST_DIR=/app/apps/web/dist`;
    - `USER node`;
    - `HEALTHCHECK` via `node -e fetch(/api/health)`.
- **`compose.yaml`:** one service, a `data` volume, and `secrets:` for `auth_session_secret`, `audit_hmac_key` and `auth_users` (plus optional provider keys), each mapped to `*_FILE`.
- **Smoke test, `scripts/container-smoke.mjs [image]`** (CI). It uses `docker run` and `fetch`:
  1. missing secret → non-zero exit, and stderr names `AUTH_SESSION_SECRET` without echoing any value;
  2. a full config with file secrets → `/api/health` 200, then `/api/ready` 200 with all checks ok, then a password login, then a lab-00 run with SSE ending in `complete`;
  3. a read-only data volume → `/api/ready` 503 (`data-dir` fail) while `/api/health` is 200.

## Lab 72

- **Inputs:**
  - `profile` (development | production);
  - `envText` (KEY=VALUE lines, up to 8 KB; `#` comments allowed);
  - `secretFiles` (JSON map of `X_FILE` → content, simulating mounted files);
  - `simulate` options (storage down, data dir read-only);
  - `probeProvider` (live only).
- **Phases (workflow steps):** parse → secrets → validate → readiness → provider probe (live) → summary.
- **Output:** the masked effective config, problems, secret sources, readiness, the probe result and the Docker run command.
- **Safety:** values matching provider key patterns (`sk-`, `sk-ant-`, `AIza`) are refused; values are never echoed (masked only).
