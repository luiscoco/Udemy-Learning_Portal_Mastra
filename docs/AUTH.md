# Authentication boundary (L61)

Run `npm run dev`, open `http://127.0.0.1:5173`; the portal automatically enters the sole local `learner` profile when no passcode is set. Learn and Source remain public. To run the authentication lesson, open `/labs/lab-61?tab=run`; its HTTP demo is free and needs no provider key.

## Local configuration

All settings belong in the server's gitignored `.env`, never a browser variable.

| Setting | Default | Purpose |
| --- | --- | --- |
| `AUTH_PROVIDER` | `dev` | Local development provider; `password` supports configured hashed users |
| `AUTH_LOCAL_AUTO_LOGIN` | `true` | Automatically enter one local learner without a passcode; `false` requires manual sign-in |
| `AUTH_DEV_USERS` | `learner` | Comma-separated local names, normalized to lowercase |
| `AUTH_DEV_PASSWORD` | unset | Optional shared local passcode; no real account passwords |
| `AUTH_SESSION_SECRET` | random per process | HMAC key, at least 32 characters when configured |
| `AUTH_SESSION_STORE` | `memory` | `sqlite` enables durable API sessions and requires a stable configured signing secret; see [SESSIONS.md](SESSIONS.md) |
| `AUDIT_HMAC_KEY` | generated once into `.data/secrets/audit-hmac.key` | Keys the L64 audit chains and head anchors; at least 32 characters when configured. Never stored next to a log, redacted from events and logs |
| `AUTH_SESSION_TTL_MS` | `28800000` (8 hours) | Session lifetime, from 1 minute to 7 days |
| `AUTH_LOGIN_RATE_MAX` | `10` | Login attempts per client IP per minute |

Names contain 1–64 letters, digits, dots, dashes or underscores. Restart after changing configuration. In default memory mode, **all sessions end on restart even with a fixed signing secret**. With `AUTH_SESSION_STORE=sqlite`, a stable secret and the same persistent data volume, valid API sessions survive restart; logout and rotation are durable. A reload preserves the browser cookie; run capabilities remain in tab memory; standard Run tabs obtain a new owner-authorized capability after reload. See [RUN-RECOVERY.md](RUN-RECOVERY.md). Signed-in progress is durable independently; see [PROGRESS.md](PROGRESS.md) and [SESSIONS.md](SESSIONS.md).

## HTTP behavior and migration

| Route | Authorization |
| --- | --- |
| `GET /api/auth/session` | Public session view, no credential value |
| `POST /api/auth/local-session` | Eligible automatic local entry; normal protected session, no credentials accepted |
| `POST /api/auth/login` | Allowlisted local credentials; generic 401 failures; rate-limited |
| `POST /api/auth/logout` | Revokes any current session and clears the cookie; idempotent |
| Health, catalog, lab definitions, source, preflight | Public |
| `POST /api/labs/:labId/runs` | Valid session required, anonymous → 401 `UNAUTHORIZED` |
| Run snapshot and event stream | Valid session and stored owner required |
| Cancel and approval decisions | Owning learner **and** `X-Run-Token` required |

This adds `UNAUTHORIZED` to the shared API error contract. Existing HTTP clients must sign in, retain the cookie, and send it on run requests, including SSE reconnects. Another learner's run returns 404, matching an unknown run. `StartMeta.ownerId` is additive for direct engine callers; the HTTP API always supplies it from the verified principal, ignoring any user-supplied owner. No lab id, route or existing run-token contract changed.

Browser `fetch` sends same-origin cookies automatically. Non-browser clients need a cookie jar. The cookie value travels only in `Set-Cookie` / `Cookie`, never JSON, URLs or localStorage. Auth views and protected run responses use `Cache-Control: no-store`. The cookie is `mlp_session=<opaque-id>.<HMAC-SHA256>` with `Path=/api; HttpOnly; SameSite=Strict; Max-Age=…`; HTTPS production cookies additionally require `Secure`. Unsafe methods reject a present `Origin` unless its scheme, host and port match the request origin. Origin-less command-line clients are supported. The development Vite proxy preserves Host for this check.

Login rotates an existing session; logout revokes it on the server, so replaying the old cookie fails. Signature checks compare hashes in constant time. The store is bounded at 10,000 sessions, expiring and evicting older entries; login rate limiting is per-process. Auth handlers log operation status and a principal id without logging headers or credentials. Configured passcodes and signing secrets join the existing redaction set. Session validity is checked when each HTTP request starts; an already open SSE response is not actively revoked by logout, and closes when the run finishes or the connection closes.

## Production boundary and remaining gates

`packages/auth` is server-only and framework independent. `IdentityProvider` describes a trusted adapter returning `{ sub, name, provider }`, or `null` for invalid credentials. `DevIdentityProvider.production` is false. `assertSafeAuthConfig` refuses this provider with `NODE_ENV=production`, and refuses local login on any HOST except `127.0.0.1`, `::1` or `localhost`. There is no environment switch that turns it into production authentication. Serving a bundled app locally still uses `NODE_ENV=development` or `test`.

To add production authentication, implement and review an identity adapter (for example OIDC with issuer, audience, state/nonce and signature validation), wire its callback/login metadata into `createAuth`, and select an appropriate shared session backend. The API now offers opt-in local SQLite sessions; remote shared storage remains a separate adapter. Stable, provider-qualified subject ids must come from the adapter, never client claims. Since L72 the API also ships `PasswordIdentityProvider` (`AUTH_PROVIDER=password`, `production: true`): scrypt-hashed users from the `AUTH_USERS` secret (`npm run auth:hash-user`), constant-time verification with equal work for unknown users, and subjects `password:<name>`. It is meant for small, single-instance deployments; sessions default to memory; configured SQLite sessions can share a local database, while remote replicas need a suitable shared backend, and organisations should prefer an OIDC adapter. A `production: true` flag alone does not implement OIDC or production session persistence. See [DEPLOYMENT-CONFIG.md](DEPLOYMENT-CONFIG.md).

This auth layer protects the Express API and is an **application adapter**, not a new Mastra method or a configuration of Mastra's own server. The official authentication guide bundled with the installed `@mastra/core` 1.78.0 distinguishes authentication from authorization; the platform enforces those checks in Express. No Mastra API or package upgrade was needed.

Before public exposure, complete [RELEASE-GATES.md](RELEASE-GATES.md): real identity, durable sessions, tenant isolation beyond the local single-process deployment (L62 covers local files), HTTPS, per-learner execution limits and cost caps, and the other hosting gates. Run ownership alone does not isolate the labs' shared storage. L61 is offline-only and costs zero; other labs' optional live mode still uses the server's configured provider keys and retains its cost notices.

## Tenant isolation (L62)

Authentication alone leaves stored data shared: inside one store, `resourceId` and `threadId` are just values. The API therefore gives each run services built for its authenticated owner (`LabRunner` option `servicesFor`, wired to `baseServices.forTenant(ownerId)` in `apps/api/src/app.ts`). Every memory store, document library and saved file resolves inside `<dataDir>/memory/tenants/<partition>/`, where the partition is the first 24 hex characters of `sha256("tenant:" + ownerId)`; runs without an owner (CLI, tests) use `tenants/local/`. Learner names never appear in paths, and hostile ids cannot traverse out. Labs keep their constant ids (`'learner'`), because the same store name opens a different file per owner.

`apps/api/src/route-classes.ts` classifies every route as `public` (no learner data) or `tenant`. `routes.audit.test.ts` lists the routes Express actually registered (all routers go through `mount()`), fails on any unclassified or stale entry, and checks every tenant route: 401 anonymous, 404 for another learner, success for the owner. `tenancy.test.ts` runs two learners through threads (L21), documents (L36), saved files (L07) and datasets/experiments (L58) and asserts neither sees the other's data.

Data written before L62 sits in the old shared locations and is **not** visible to anyone. Migrate it explicitly to one owner. The script copies stores (`*.db*`), their sidecar records (`*.jsonl`, such as the L32–L34 ledgers, so a resumed workflow never repeats a recorded side effect), the document library and saved comparisons. It copies by default and never overwrites:

```sh
node scripts/migrate-tenant-data.mjs --owner dev:learner --dry-run
node scripts/migrate-tenant-data.mjs --owner dev:learner        # copy
node scripts/migrate-tenant-data.mjs --owner dev:learner --move # copy, then delete the legacy source
```

**Browser storage.** Source-tab scratch notes and legacy lab progress use a per-learner localStorage scope (`apps/web/src/lib/storage-scope.ts`): `guest` when signed out, otherwise `u` plus an FNV-1a hash of the principal id. Signing out switches to guest, so the next learner on a shared browser sees none of the previous learner's data. A learner without data of their own takes over guest data once (including data saved before scoping). This prevents accidental display; it is not a security boundary, because any same-origin script can read localStorage. Signed-in progress now uses account-bound API storage plus a local outbox under `mlp.progress.v2:<encoded subject>`. The server chooses the tenant from the session and rejects a mismatched progress subject header, including stale requests after account switching. See [PROGRESS.md](PROGRESS.md).

This is an application-level design over Mastra's storage adapters, not a native Mastra multi-tenancy API. It covers the local single-process deployment; a shared remote database needs per-tenant databases or enforced row scoping.

## Verification and instructor demo

`npm run verify` checks lint, strict types, offline tests, bundles and secret scanning. `npm run test:e2e` signs in through a setup project, saves a gitignored test cookie jar and exercises desktop/mobile sessions. The auth spec starts anonymous, verifies refusal, signs in and returns to the lab, executes it, reloads, and signs out. Unit/integration tests cover tampering, expiry, revocation, rate limits, origin checks, production refusal and foreign-owner requests with a valid run token. Optional live API tests now sign in too; they are not required to test authentication.

For a six-minute demo: contrast identity and ownership; sign in as learner; run Lab 61; compare 401/200/404; inspect cookie flags without revealing the cookie; explain injected-clock expiry and replay after logout; finish with production refusal and the L62 isolation work. The lab definition contains the timed outline, quiz, hints and challenge.

## Run request admission

Verified sessions provide the learner key for run-start and approval/recovery limits; changing tabs or logging in again does not reset that account allowance. Owner checks precede run control admission. The client network comes from the configured Express proxy trust boundary, with IPv6 /64 grouping. Cancellation is exempt. See [RATE-LIMITS.md](RATE-LIMITS.md).


## Automatic local learner entry

The default local portal enters the sole configured learner automatically. No manual sign-in is needed for runs or AI Tutor. The header shows **Local learner**; progress and notes still belong to that normal server session. Offline Tutor is free; live Tutor requires configured provider credentials and retains its cost notice.

Automatic entry requires the development identity provider, a loopback host, one allowed learner and no passcode. Set `AUTH_LOCAL_AUTO_LOGIN=false` in the repository-root `.env` and restart the API to require explicit sign-in. Passcode, multiple-profile and password-provider configurations always require explicit sign-in. Existing sessions are preserved. Session startup failures offer retry; recovery never submits or replays a Tutor question.


### Implementation and validation

The local entry boundary is in `apps/api/src/auth.ts`, configured by `packages/deploy/src/schema.ts`. The additive response metadata lives in `packages/contracts/src/auth.ts`; `packages/client/src/client.ts` exposes the typed local-session method. Browser bootstrap and recovery live in `apps/web/src/lib/auth-context.tsx`; the shared Tutor and session header display session readiness.

`npm run verify` completed all stages: lint, strict workspace TypeScript, 1,773 passing tests with 84 optional skips, production builds and the bundle-secret scan. All 91 main specifications passed strict validation after synchronization. Session lifecycle tests cover expiry renewal, explicit logout and obsolete initialization. Evidence is in the ignored `.data/local-learner-verify.log`.

The browser acceptance in `e2e/local-learner.spec.ts` uses a real bundled API with one configured learner and no browser session. It visits every lesson, checks offline and configured-live Tutor availability, and requests real offline guidance in the first and last lessons. Live readiness is a fixture; this change makes no paid provider calls.


The full `npm run test:e2e` run passed 287 cases and skipped 158; the two new acceptance cases initially used the offline button label after switching to live mode. After correcting that test locator, `npm run test:e2e -- --last-failed` passed all 3 selected cases (setup plus desktop/mobile acceptance), exit 0. All 289 distinct browser cases therefore passed after correction. Each acceptance case visited all 76 lessons and confirmed automatic identity, offline/live button readiness, offline guidance and reload persistence. Evidence: `.data/local-learner-e2e-final.log`, `.data/local-learner-e2e-rerun.log` and `.data/local-learner-e2e-rerun.exit`. The corrected browser fixtures also passed ESLint. No new unsupported features or unresolved implementation errors were identified; protected configurations intentionally retain explicit sign-in.
