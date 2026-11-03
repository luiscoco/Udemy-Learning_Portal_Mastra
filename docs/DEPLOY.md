# Deploying to staging (Azure Container Apps)

This guide covers how the platform's staging environment is deployed, verified and rolled back. It builds on the container from L72 ([DEPLOYMENT-CONFIG.md](DEPLOYMENT-CONFIG.md)).

## Topology

```
browser ──HTTPS──▶ Container Apps ingress (managed TLS, HTTP→HTTPS) ──▶ revision: node apps/api/dist/server.js
                                                                         ├─ serves the web app (same origin)
                                                                         ├─ /api/* and SSE /api/runs/:id/events
                                                                         └─ /data  ← Azure Files share (SQLite stores)
```

- **One origin for the frontend and the backend.** The API serves the built web app, so the session cookie stays `Secure; HttpOnly; SameSite=Strict` and CORS isn't needed.
- **TLS** is terminated by the Container Apps ingress, which gets a managed certificate for `*.azurecontainerapps.io`. The app trusts one proxy hop (`TRUST_PROXY=1`), so it sees `https`.
- **SSE** passes through the ingress unbuffered. The API sends a heartbeat every 15 s, well inside the ingress idle timeout.
- **Single replica** (`maxReplicas: 1`). Sessions are held in memory, and SQLite on a network share must have only one writer.

## Prerequisites

- **Azure CLI**, signed in with `az login`; the script installs the `containerapp` extension if it's missing.
- **Docker isn't needed.** `az acr build` builds the image in Azure, from the same `Dockerfile` and `.dockerignore`.
- **Permission** to create resources and role assignments in the subscription (Owner, or Contributor plus User Access Administrator).

## Deploy (repeatable)

```bash
npm run deploy:azure            # commit first; the image tag is the commit hash
```

Every step is idempotent: running the script again deploys the current commit as a new revision.

| Step | Resource |
| --- | --- |
| 1 | Resource group `mlp-staging-rg` (`northeurope`; override with `--location` (westeurope refused new customers for this subscription in 2026-11)) |
| 2 | Container registry `mlpstaging<hash>` (Basic, admin user disabled) and `az acr build` → `mastra-learning-platform:<commit>` |
| 3 | User-assigned identity `mlp-staging-id` with **AcrPull** on the registry (the app pulls without passwords) |
| 4 | Storage account `mlpstg<hash>` with the file share `mlpdata` (5 GiB), registered on the environment |
| 5 | Container Apps environment `mlp-staging-env` (logs go to Log Analytics) |
| 6 | Secrets, generated once into `secrets/staging/` (gitignored): session secret, audit key, the `learner` password (stored only as a scrypt hash in the app) |
| 7 | Container App `mlp-staging` from YAML (see below) |
| 8 | The script waits for `https://<fqdn>/api/ready`, records the release in `secrets/staging/releases.json` and writes the URL to `secrets/staging/url` |

The Container App YAML (`secrets/staging/app.yaml`, which contains the secret values) sets:

- **Ingress:** external, port 8787, `allowInsecure: false` (HTTP redirects to HTTPS).
- **Probes:**
  - liveness on `/api/health`: a crash triggers a restart;
  - readiness on `/api/ready`: no traffic reaches a revision until it is ready.
- **Environment:**
  - `NODE_ENV=production`, `MLP_DATA_DIR=/data`, `TRUST_PROXY=1`, `MASTRA_MODE=offline`;
  - secrets through `secretRef`: `AUTH_SESSION_SECRET`, `AUDIT_HMAC_KEY` and `AUTH_USERS`.
- **Volume:** `/data` on Azure Files, mounted with `nobrl` (SQLite byte-range locks stay local to the single replica), `uid/gid 1000` (the image's `node` user) and `cache=none`.
- **Scale:** min 0, max 1. Idle staging costs almost nothing, and the first request after idle waits for a cold start.

**Live models on staging:** this is deliberately off, because a public URL with provider keys can spend money. To enable it, add a provider key as a Container Apps secret, set `MASTRA_MODE=live`, and keep an eye on the provider's spending limits.

## Verify: staging smoke test

```bash
npm run smoke:staging -- --restart
```

This checks the definition of done against the real URL and writes `secrets/staging/last-smoke.json`:

1. HTTP redirects to HTTPS, and the HTTPS certificate is valid (Node verifies the chain).
2. `/api/health` returns 200, and `/api/ready` returns 200 with `storage=ok`.
3. The web app is served on the same origin.
4. A password login returns a `Secure; HttpOnly; SameSite=Strict` cookie.
5. **Streaming:** a lab-00 run's SSE tokens arrive spread over time, before `complete`, through the ingress (not buffered).
6. **Persistence:** a lab-71 durable note is written, the revision is restarted, readiness is awaited again, and a second run recalls the first note and applies no migrations.
   The process uptime must drop after the restart, which proves that a new process answered.

Last recorded result: **11/11 passed** on 2026-11-03 against `1c44e430447f`. SSE tokens arrived spread out between 198 and 823 ms, the uptime fell from 75 s to 14 s across the restart, and 6 notes survived two deployments, a rollback and three restarts.

## What the first real deployment taught us (2026-11-03)

These findings are now handled by `scripts/deploy-azure.ts`:

| Problem | Fix |
| --- | --- |
| **The region refused new customers.** `westeurope` answered `RequestDisallowedByAzure` for this subscription. | The default is `northeurope`, and every resource gets `-l <location>` explicitly. |
| **`.dockerignore` is not a secret boundary.** `az acr build` applies it with its own matcher, and the first upload ran for over 12 minutes (it was stopped before anything reached the registry). | The build context is a `git archive` of HEAD: about 1,400 committed files, 6 MB. Gitignored `secrets/`, `.env`, `.data` and `node_modules` cannot be included, and the script refuses to build if they appear. The Dockerfile also deletes them. |
| **Streaming build logs crashes the CLI on Windows.** `'charmap' codec can't encode`: `az.cmd` runs Python with `-I`, so `PYTHONIOENCODING` is ignored. | `az acr build --no-logs` queues the build, and the script polls `az acr task show-run`. Read a failed build with `az acr task logs`, or in the portal. |
| **`az role assignment list --assignee` needs a Microsoft Graph token.** | List by scope and role, then filter by principal ID locally. |
| **Sign-in expiry with a personal Microsoft account.** `AADSTS9002313` (interaction required), even for resource management, a couple of hours after sign-in. | `az config set core.enable_broker_on_windows=false`, then `az login --use-device-code`. |

## Roll back

```bash
npm run deploy:azure -- --rollback
```

This finds the most recent earlier image in `releases.json` and runs `az containerapp update --image <previous>`. It waits for `/api/ready` and records the rollback. Images are immutable and tagged by commit, so a rollback always names exact bytes.

For instant rollbacks, use blue-green revisions:

```bash
az containerapp revision set-mode -g mlp-staging-rg -n mlp-staging --mode multiple
az containerapp ingress traffic set -g mlp-staging-rg -n mlp-staging --revision-weight <old-revision>=100
```

## Operations

- **Logs:** `az containerapp logs show -g mlp-staging-rg -n mlp-staging --follow`. The lines are JSON, with request ids and no secrets.
- **Restart:** `az containerapp revision restart -g mlp-staging-rg -n mlp-staging --revision <name>`.
- **Rotate secrets:** delete the file in `secrets/staging/`, then run `npm run deploy:azure` again. Rotating the session secret signs everyone out.
- **Backups:** `/data` is an Azure Files share. Enable share snapshots, and use the Lab 71 backup and restore procedure for the SQLite stores ([RETENTION.md](RETENTION.md)).
- **Costs (approximate):**
  - registry Basic: about US$5 a month;
  - storage: cents;
  - Container Apps consumption with scale to zero: usually inside the monthly free grant for staging use;
  - Log Analytics: pay per GB ingested (small for this app).
- **Teardown:** `az group delete -n mlp-staging-rg --yes`. This deletes everything, including the data share.

## Limits

- **One replica.** Horizontal scaling needs a shared session store and a database that supports several writers (for example a hosted libSQL/Turso or Postgres store). SQLite files on SMB are fine for one writer only.
- **Cold starts.** With min replicas 0, the first request after idle takes some seconds. Set `minReplicas: 1` for demos, which costs money continuously.
- **No custom domain yet.** Add one with a managed certificate: `az containerapp hostname add` / `bind`.
