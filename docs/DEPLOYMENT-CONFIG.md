# Deployment configuration and packaging

This guide covers how the API is configured, packaged and checked in production. It describes what L72 added; L73 deploys it.

## One image, configured at run time

The `Dockerfile` builds one image, which runs the API and serves the built web app from the same origin.

- **Image:** a multi-stage build on `node:24-bookworm-slim`. It runs as the non-root `node` user, with `/data` as a volume, port 8787 and a `HEALTHCHECK` on `/api/health`.
- **Image defaults:** `NODE_ENV=production`, `HOST=0.0.0.0`, `MLP_DATA_DIR=/data`, `WEB_DIST_DIR=/app/apps/web/dist` and `AUTH_PROVIDER=password`.
- **Never inside the image:** `.env`, `.data`, `secrets/` and `node_modules`; `.dockerignore` excludes them.
- **Pinning:** for reproducible production builds, pin the base image by digest (`node:24-bookworm-slim@sha256:…`) after you have tested it.

## Configuration rules (`@mlp/deploy`)

At start-up the API runs these steps in order:

1. **Secrets from files.** Every secret `X` can be given as `X` or as `X_FILE=/path`, but not both. A file is read and trimmed. A missing, empty or oversized file is an error. The secrets are:
   - `AUTH_SESSION_SECRET`, `AUDIT_HMAC_KEY`, `AUTH_USERS`, `AUTH_DEV_PASSWORD`;
   - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.
2. **Schema.** A Zod schema checks the types and ranges of every setting.
3. **Profile rules.** With `NODE_ENV=production` these are required:
   - `AUTH_PROVIDER=password` (the development login is refused);
   - `AUTH_USERS`, `AUTH_SESSION_SECRET` (at least 32 characters) and `AUDIT_HMAC_KEY` (at least 32 characters);
   - an absolute `MLP_DATA_DIR`;
   - at least one provider key when `MASTRA_MODE=live`.

   Development accepts the same shortcuts but logs warnings.

If any step fails, the API prints one line naming every problem by key and exits with code **78** (EX_CONFIG). It never prints values. For example:

```
[config] Refusing to start (NODE_ENV=production): AUTH_SESSION_SECRET is required in production (set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE)
```

Secrets loaded from files are placed into the server's own `process.env`, because Mastra's model router reads provider keys there. They never leave the server process.

| Setting | Purpose |
| --- | --- |
| `TRUST_PROXY` | `false` \| `true` \| `loopback` \| `1`–`5`. Set it behind a TLS-terminating proxy, so that `req.protocol` and the same-origin check see `https` and secure cookies work. |
| `LOG_REQUESTS` | One JSON line per request: `requestId`, method, path (never the query string), status and `durationMs`. All logs are JSON lines with known secret values redacted. |
| `MLP_DATA_DIR` | Every durable store lives here: memory databases, tenant partitions, the audit chain and backups. Mount a persistent volume on it. |

## Sign-in for production: password users

`AUTH_PROVIDER=password` uses scrypt-hashed users from `AUTH_USERS`:

```bash
npm run auth:hash-user -- ana        # prompts on stdin; prints ana:scrypt$16384$8$1$<salt>$<hash>
```

Join entries with commas and supply them as the `AUTH_USERS_FILE` secret.

- **Verification:** constant-time, with the same work for unknown users as for known ones.
- **Sessions:** `memory` remains the compatibility default. Set `AUTH_SESSION_STORE=sqlite` with the stable `AUTH_SESSION_SECRET` or its `_FILE` form to persist sessions in `<MLP_DATA_DIR>/auth/sessions.db`. Storage initialization completes before listening. Participating processes need the same file, secret and identity settings; this local adapter does not make all platform stores safe for multiple replicas. See [SESSIONS.md](SESSIONS.md).

Larger deployments should add an OIDC adapter (see [AUTH.md](AUTH.md)).

## Health and readiness

| Endpoint | Meaning | Use it for |
| --- | --- | --- |
| `GET /api/health` | The process is up (liveness). | Container `HEALTHCHECK`, restart decisions |
| `GET /api/ready` | It can serve learners now (readiness): 200 or 503 with the checks below. | Load balancer and orchestrator traffic |

The readiness checks are:

| Check | What it does |
| --- | --- |
| `config` | Confirms the configuration was validated at start-up. |
| `data-dir` | Writes and then deletes a probe file. |
| `storage` | Runs `SELECT 1` on a libSQL probe database, with a 2-second timeout. |
| `web-bundle` | Checks that `index.html` is present (only when `WEB_DIST_DIR` is set). |
| `providers` | In live mode, checks that a key is present. It makes no network call, so readiness never costs money or depends on a provider's uptime. |
| `runner` | Checks that the instance is not draining. |

**Shutdown:** on SIGTERM the instance turns not-ready first, then stops its runs and closes the probe.

**Answers:** results are cached for 2 seconds. The answers contain no paths or values.

## Local production-like run

```bash
npm run make-secrets -- learner    # writes ./secrets (gitignored); prints the learner password once
docker compose up --build          # http://127.0.0.1:8787
```

`compose.yaml` mounts the secrets as Docker secrets and points each `*_FILE` variable at `/run/secrets/<name>`. For live mode, add a provider key secret and set `MASTRA_MODE=live`.

## Proof in CI

The `container` job in `.github/workflows/ci.yml` builds the image and runs `npm run smoke:container -- <image>`. The smoke test checks five things:

1. A production container without `AUTH_SESSION_SECRET` exits with code 78 and names the key, and no secret value appears in its output.
2. With file secrets, `/api/health` and `/api/ready` return 200, and Docker reports the container `healthy`.
3. A password login works, and a lab-00 run streams over SSE to `complete — succeeded`.
4. The logs are JSON lines without secrets.
5. With a read-only data volume, `/api/ready` returns 503 with `data-dir` failing, while `/api/health` stays 200.

HTTP execution storage: `RUN_STORE=memory` is the default. `RUN_STORE=sqlite` requires `RUN_STORE_SECRET` (32+ characters) or `RUN_STORE_SECRET_FILE` and a persistent local data root. One active runner may own a journal. See [RUN-RECOVERY.md](RUN-RECOVERY.md).

Run request limits are enabled by default: 30 starts per learner / 120 per client network, and 60 approval/recovery requests per learner / 240 per network in 60 seconds. Configure `RUN_RATE_WINDOW_MS` and the four `RUN_*_RATE_*_MAX` settings for your environment; see [RATE-LIMITS.md](RATE-LIMITS.md). `TRUST_PROXY=false` ignores spoofed forwarding headers; enable trust only for your actual proxy topology. Limits are local to one API process and reset on restart.
