# Design

## Azure resources (names are deterministic per resource group)

| Resource | Name | Notes |
| --- | --- | --- |
| Resource group | `mlp-staging-rg` | Region `westeurope` (override with `--location`). |
| Container registry | `mlpstaging<6 hex of sha256(subscription id + rg)>` | Basic SKU, admin disabled. The app pulls with a system-assigned identity that has the AcrPull role. |
| Log Analytics + Container Apps environment | `mlp-staging-env` | The app's stdout JSON logs go to Log Analytics. |
| Storage account | `mlpstg<6 hex>` | Standard_LRS. File share `mlpdata` registered as environment storage `mlpdata` (ReadWrite). |
| Container App | `mlp-staging` | Defined by YAML (`az containerapp create --yaml`), see below. |

The Container App YAML sets:

- a volume `data` on AzureFile `mlpdata` with `mountOptions: dir_mode=0777,file_mode=0777,uid=1000,gid=1000,nobrl`, mounted at `/data`;
- secrets `auth-session-secret`, `audit-hmac-key` and `auth-users`, wired into env with `secretRef`;
- env `NODE_ENV=production`, `MLP_DATA_DIR=/data`, `TRUST_PROXY=1`, `LOG_LEVEL=info`, `MASTRA_MODE=offline`;
- probes: liveness `/api/health` and readiness `/api/ready` (period 10 s);
- ingress: external, targetPort 8787, `allowInsecure: false`, transport `auto`;
- scale: min 0, max 1. One replica is required because sessions are in memory and SQLite is used.

## Repeatability

- **Idempotent steps:** each step is a show-then-create or an update.
- **Image tag:** `git rev-parse --short HEAD`. A dirty tree is refused unless `--allow-dirty` is given.
- **Secrets:** generated once into `secrets/staging/` (gitignored, mode 0600) and reused. The learner password is written to `secrets/staging/learner-password` and never printed.
- **Rollback:** `releases.json` stores `{ tag, image, revision, at }`. `--rollback` points the app at the previous image (`az containerapp update --image`), polls `/api/ready` until it answers 200, and records the rollback.

## Staging smoke (`scripts/staging-smoke.ts`)

- **Input:** `--url https://…`; the password comes from `secrets/staging/learner-password`, and `--restart` triggers `az containerapp revision restart` between the persistence phases.
- **Checks:**
  - **TLS:** the `https` fetch succeeds (Node verifies the certificate chain), and `http://` answers a 301/308 redirect to `https://`;
  - **Health and readiness:** both answer 200, and `storage=ok`;
  - **Cookie flags:** `Secure`, `HttpOnly` and `SameSite=Strict`;
  - **Streaming:** a lab-00 run's SSE delivers its first `token` event before `complete`, with at least two reads spread over time (`delayMs` 150 between words), which proves the stream isn't buffered;
  - **Persistence:**
    1. a lab-71 run with `store: durable` and note A;
    2. a restart;
    3. wait for readiness again;
    4. a lab-71 run with note B, then assert that `migration.applied` is empty and `restart.recalled` contains A and B.
- **Output:** PASS/FAIL lines plus a JSON summary (`secrets/staging/last-smoke.json`).

## Lab 73: release simulator

- **Inputs:**
  - `scenario`: healthy | missing-secret | readiness-fails | slow-start | sse-buffered;
  - `strategy`: single | blue-green;
  - `readinessTimeoutS` (5–120);
  - `autoRollback` (boolean);
  - `probeStaging` (live).
- **Model:** revisions `{ name, image, state: provisioning|ready|failed, traffic }`. The simulated clock advances through readiness polls, with no real waits beyond a few milliseconds per step.
- **Steps:** `build`, `push`, `create-revision`, `readiness-gate`, `shift-traffic`, `smoke`, `rollback` (when needed), `summary`.
- **Output:** the timeline, the revisions, the final traffic split, the active image, downtime seconds (traffic on an unready revision), the rollback flag and the deploy commands for the chosen strategy.
- **Live:** the server fetches `STAGING_URL` from its own env (https only), with a 10 s timeout each: health, then ready, then SSE first byte (anonymous lab-00 catalog only; no login). Without `STAGING_URL` it answers `NOT_CONFIGURED`.
