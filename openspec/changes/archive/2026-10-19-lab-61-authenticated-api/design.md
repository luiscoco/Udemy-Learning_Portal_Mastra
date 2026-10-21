# Design

## Context

- The API (Express 5) has public reads (health, catalog, lab definitions, source, preflight), a run start that returns a `runToken`, token-checked mutations (cancel, approvals) and **unprotected run reads** (`GET /api/runs/:runId`, `/events`).
- The web app calls the API on the same origin (Vite proxy in development; the API serves `dist` in e2e and production). `fetch` sends same-origin cookies by default, which also covers the event stream (read with `fetch`).
- No authentication library is installed. Node's `crypto` (HMAC-SHA256, `timingSafeEqual`, `randomBytes`) is enough for signed opaque session ids with a server-side store. **This is a development-grade session store**: in memory, lost on restart, single process. A production deployment needs a real identity provider and a shared session store, and the abstraction is designed so both can be plugged in.

## Decisions

- **`@mlp/auth`** (`packages/auth`, ESM TypeScript source, server-only):
  - `Principal { sub, name, provider }`.
  - `IdentityProvider { id, production, authenticate(c: { username, password? }) }`.
  - `DevIdentityProvider({ users, password? })`: rejects unknown users and wrong passcodes with the same `null`, and compares in constant time.
  - `SessionManager({ secret, ttlMs, now? })`:
    - `create(principal) → { cookieValue, session }`, where the value is `<sid>.<base64url HMAC(sid)>` with a 32-byte random sid;
    - `verify(cookieValue) → session | null` (constant-time signature check, expiry and revocation);
    - `revoke(sid)`;
    - the store is a `Map`, purged when creating sessions and when an expired session is verified, with at most 10 000 sessions.
  - Cookies: `serializeCookie(value, { maxAgeSeconds, secure })` → `mlp_session=…; Path=/api; HttpOnly; SameSite=Strict; Max-Age=…[; Secure]`; `clearCookie`; and `parseCookies(header)`.
  - `sameOriginOrAbsent(origin, host, protocol)`: `true` when `Origin` is absent or its scheme, host and port equal the request origin. Empty or opaque origins are refused.
  - `LoginRateLimiter({ max, windowMs })`, keyed by IP.
  - `assertSafeAuthConfig({ nodeEnv, host, provider })`: throws `AuthConfigError` for a non-production provider in production, or for dev login on a host other than `127.0.0.1`, `::1` or `localhost`.
- **Config** (`apps/api/src/config.ts`):
  - `AUTH_PROVIDER` (`dev` only for now; anything else fails validation);
  - `AUTH_DEV_USERS` (default `learner`);
  - `AUTH_DEV_PASSWORD` (optional);
  - `AUTH_SESSION_SECRET` (optional, at least 32 characters);
  - `AUTH_SESSION_TTL_MS` (default 8 h);
  - `AUTH_LOGIN_RATE_MAX` (default 10 per minute).

  `secretValues` now also includes the session secret and the dev passcode.
- **API wiring** (`apps/api/src/auth.ts`):
  - `authMiddleware` sets `req.principal` (or leaves it undefined) and enforces the origin check on unsafe methods;
  - `requireAuth` throws `LabError('UNAUTHORIZED')`;
  - the routes `/api/auth/session` (`{ authenticated, principal | null, provider, login: { kind: 'dev', passwordRequired } }`), `/api/auth/login` (body `{ username, password? }`, 64 KB JSON, rate-limited) and `/api/auth/logout`.

  Run routes are wrapped with `requireAuth` and an ownership check (`runner.ownerOf(runId) === principal.sub`, else `NOT_FOUND`), and the run start passes `ownerId: principal.sub`.
- **Contracts:** `ApiErrorCode` += `UNAUTHORIZED` (API status 401); `SessionResponseSchema` and `LoginRequestSchema` (`username` 1–64 of `[a-z0-9._-]`, `password` ≤ 200).
- **Web:**
  - `api/auth.ts` (`getSession`, `login`, `logout`) and an `AuthProvider` context with `useSession()`;
  - the `/login` route (`LoginPage`, with the next path validated to start with a single `/`);
  - the header (`AppShell`) shows the status and sign-out;
  - `RunTab` shows a sign-in card when the visitor is anonymous, and maps a 401 `UNAUTHORIZED` from start to the same card.
- **Playwright:** project `setup` (`e2e/auth.setup.ts`) posts to `/api/auth/login` and saves `e2e/.auth/learner.json` (gitignored); desktop and mobile use it as `storageState` and depend on `setup`. The new `e2e/auth.spec.ts` uses `test.use({ storageState: { cookies: [], origins: [] } })`.
- **Lab 61** (`packages/labs/src/lab-61/`):
  - `server.ts`: a `node:http` loopback server built from `@mlp/auth` with `/login`, `/logout`, `/runs` (POST, owner-bound) and `/runs/:id` (GET); it records log lines.
  - `run.ts` sends real requests for the scenarios, and the checks are one per defence.
  - Inputs: user names and an optional passcode for the demo, and a session TTL for the expiry scenario (the clock is injected, so nothing sleeps).
  - Offline only, no model.
