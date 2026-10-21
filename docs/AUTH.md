# Authentication boundary (L61)

Run `npm run dev`, open `http://127.0.0.1:5173`, choose **Sign in**, and use `learner`. The default local login has no passcode. The Run tab returns you to the selected lab after sign-in. Learn and Source remain public. To run the authentication lesson, open `/labs/lab-61?tab=run`; its HTTP demo is free and needs no provider key.

## Local configuration

All settings belong in the server's gitignored `.env`, never a browser variable.

| Setting | Default | Purpose |
| --- | --- | --- |
| `AUTH_PROVIDER` | `dev` | Only shipped provider; any other value fails validation |
| `AUTH_DEV_USERS` | `learner` | Comma-separated local names, normalized to lowercase |
| `AUTH_DEV_PASSWORD` | unset | Optional shared local passcode; no real account passwords |
| `AUTH_SESSION_SECRET` | random per process | HMAC key, at least 32 characters when configured |
| `AUTH_SESSION_TTL_MS` | `28800000` (8 hours) | Session lifetime, from 1 minute to 7 days |
| `AUTH_LOGIN_RATE_MAX` | `10` | Login attempts per client IP per minute |

Names contain 1–64 letters, digits, dots, dashes or underscores. Restart after changing configuration. Sessions are in memory: **all sessions end on restart even with a fixed signing secret**. A reload preserves the browser cookie; the current run token remains in tab memory and is lost on reload. Progress still uses the existing browser progress store.

## HTTP behavior and migration

| Route | Authorization |
| --- | --- |
| `GET /api/auth/session` | Public session view, no credential value |
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

To add production authentication, implement and review an identity adapter (for example OIDC with issuer, audience, state/nonce and signature validation), wire its callback/login metadata into `createAuth`, and replace the in-memory session store with shared durable storage. Stable, provider-qualified subject ids must come from the adapter, never client claims. The current API factory deliberately ships only the development provider; a `production: true` flag alone does not implement OIDC or production session persistence.

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

**Browser storage.** Lab progress and Source-tab scratch notes are kept in localStorage under a per-learner scope (`apps/web/src/lib/storage-scope.ts`): `guest` when signed out, otherwise `u` plus an FNV-1a hash of the principal id. Signing out switches to guest, so the next learner on a shared browser sees none of the previous learner's data. A learner without data of their own takes over guest data once (including data saved before scoping). This prevents accidental display; it is not a security boundary, because any same-origin script can read localStorage. Server-side progress remains a release gate.

This is an application-level design over Mastra's storage adapters, not a native Mastra multi-tenancy API. It covers the local single-process deployment; a shared remote database needs per-tenant databases or enforced row scoping.

## Verification and instructor demo

`npm run verify` checks lint, strict types, offline tests, bundles and secret scanning. `npm run test:e2e` signs in through a setup project, saves a gitignored test cookie jar and exercises desktop/mobile sessions. The auth spec starts anonymous, verifies refusal, signs in and returns to the lab, executes it, reloads, and signs out. Unit/integration tests cover tampering, expiry, revocation, rate limits, origin checks, production refusal and foreign-owner requests with a valid run token. Optional live API tests now sign in too; they are not required to test authentication.

For a six-minute demo: contrast identity and ownership; sign in as learner; run Lab 61; compare 401/200/404; inspect cookie flags without revealing the cookie; explain injected-clock expiry and replay after logout; finish with production refusal and the L62 isolation work. The lab definition contains the timed outline, quiz, hints and challenge.
