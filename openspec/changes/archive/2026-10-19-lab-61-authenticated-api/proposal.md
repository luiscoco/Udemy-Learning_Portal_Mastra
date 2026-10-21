# Proposal

## Why

Anyone who can reach the API can start lab runs today, including live runs that spend provider credits, and anyone who knows a run id can read its events (tool arguments, model output). The release gates list "real learner identity" and "protected reads" as the highest-priority items before public exposure. Module 13 starts with that boundary.

The DoD asks for a development-safe login and a production-grade auth boundary abstraction, gating lab execution: anonymous execution is refused and credentials are not leaked.

## What Changes

- **New server-only package `@mlp/auth`** (framework-agnostic, no Express dependency):
  - **`IdentityProvider` interface:** `id`, `authenticate(credentials) → Principal | null`, and `production: boolean` (whether it may be used in production). This is the boundary a production identity provider (OIDC, SSO) implements.
  - **`DevIdentityProvider`:** a username allowlist (`AUTH_DEV_USERS`, default `learner`) and an optional passcode (`AUTH_DEV_PASSWORD`, constant-time compare), with `production: false`.
  - **`SessionManager`:** server-side sessions. The opaque random session id is signed with HMAC-SHA256 (`AUTH_SESSION_SECRET` ≥ 32 characters, or a random per-process secret). The cookie `mlp_session` is `HttpOnly`, `SameSite=Strict` and `Path=/api`, plus `Secure` in production. Sessions have a TTL and are revoked on logout, and the signature is verified in constant time.
  - **`assertSafeAuthConfig`:** fail closed. Startup is refused when a non-production provider is configured in `NODE_ENV=production`, and when dev login runs on a non-loopback host.
  - Helpers: `parseCookies`, `serializeCookie`, `sameOriginOrAbsent` (CSRF origin check) and a fixed-window `LoginRateLimiter`.
- **API (`apps/api`):**
  - `POST /api/auth/login` (dev provider, rate-limited, one generic error for unknown users and wrong passcodes), `POST /api/auth/logout`, `GET /api/auth/session`.
  - Middleware attaches the principal from the cookie.
  - **Gated routes:** `POST /api/labs/:labId/runs` (anonymous → 401 `UNAUTHORIZED`), and cancel, approvals, `GET /api/runs/:runId` and `/events`, which require the owning session (another learner's run → 404). The run token stays as a second factor for mutations.
  - Unsafe methods with a foreign `Origin` → 403.
  - The session secret and passcode are added to the redaction set.
  - **Public routes:** health, catalog, lab definitions, source and preflight.
- **Lab engine:** `StartMeta.ownerId` (additive); `runner.ownerOf(runId)`.
- **Contracts:** `ApiErrorCode` gains `UNAUTHORIZED` (additive, 401); new `SessionResponseSchema` and `LoginRequestSchema`.
- **Web:** an auth context (`useSession`), a `/login` page (username and passcode) with a return to the previous page, a header status ("Signed in as …" / "Sign in"), and a Run tab that asks to sign in instead of running, also on a 401.
- **Tests:**
  - API tests sign in through a helper.
  - **Playwright:** a `setup` project signs in and saves `storageState`, the other projects depend on it, and a new auth spec uses a fresh context for anonymous refusal and the login flow.
- **New lab `lab-61`** (Module 13): an in-process demonstration of the boundary. A loopback `node:http` server uses `@mlp/auth` and is exercised by real HTTP requests: anonymous refused, dev login cookie flags, tampered and expired cookies, another user's run, logout revocation, the production fail-closed config, and secret redaction.
- **Docs:** `docs/AUTH.md`, plus `RELEASE-GATES.md` updates (identity boundary and protected reads done for dev; a production identity provider, persistent sessions and rate limits on run starts are still open).

## Capabilities

### New Capabilities

- `platform/auth-boundary`
- `course-labs/lab-61-authenticated-api`

### Modified Capabilities

(none; the API gains authentication, documented in the platform capability)

## Impact

- **Packages:** `packages/auth` (new), `packages/contracts`, `packages/lab-engine`, `packages/labs` (lab-61), `apps/api`, `apps/web`, `e2e`, `playwright.config.ts`, docs.
- **Behaviour change:** every run now requires sign-in. Dev login is loopback-only and refused in production.
