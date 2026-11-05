# Durable API sessions implementation

Date: 2026-11-05. OpenSpec change: `durable-api-sessions`.

All five tracked tasks are complete. The auth-boundary delta was synced before full verification, and the change is archived at [`2026-11-05-durable-api-sessions`](../openspec/changes/archive/2026-11-05-durable-api-sessions/proposal.md). Archive used `--skip-specs` because the main specification was already merged.

## Result and activation

The API supports durable sessions with `AUTH_SESSION_STORE=sqlite`, a configured stable `AUTH_SESSION_SECRET` or `AUTH_SESSION_SECRET_FILE`, and a persistent data directory. Memory remains the compatibility default. Enabling durable mode requires one login; valid new cookies then survive API restart. Logout and rotation persist, and other processes sharing the database observe revocation on their next request.

## Changed files

| Area | Paths |
| --- | --- |
| Cookie helpers and retained teaching manager | `packages/auth/src/sessions.ts` |
| Additive configuration, validation and safe logging | `packages/deploy/src/schema.ts`, `.env.example`, `apps/api/src/config.test.ts` |
| Versioned durable store and integrity checks | `apps/api/src/session-store.ts` |
| Awaitable HTTP auth and startup initialization | `apps/api/src/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts` |
| Store/HTTP/process regression coverage | `apps/api/src/session-store.test.ts`, `durable-auth.test.ts`, `durable-auth-process.test.ts`, `session-process.fixture.ts` |
| Complete bundled app restart coverage | `e2e/session-persistence.spec.ts` |
| Usage, compatibility and release gates | `docs/SESSIONS.md`, `AUTH.md`, `DEPLOYMENT-CONFIG.md`, `PROGRESS.md`, `RETENTION.md`, `RELEASE-GATES.md`, `COMPATIBILITY.md`, `README.md` |
| Specification | `openspec/specs/platform/auth-boundary/spec.md` |

The database is `<effectiveDataDir>/auth/sessions.db`. It stores hashed opaque IDs, bounded principal JSON, absolute timestamps, an identity-policy fingerprint and a keyed integrity proof. The migration history is checksummed. No session value is returned in JSON, stored in browser localStorage or logged. The existing HttpOnly cookie and HTTP schemas remain compatible. Lab 61 keeps its synchronous in-memory teaching manager.

## Verification

`npm run verify` passed with captured native exit code 0: 1,633 tests passed, 69 skipped; 143 test files passed, 2 skipped. All 89 main specifications, lint, strict types, environment checks, API/web builds and production bundle secret scanning passed. The scan confirmed both configured secret values and all six checked key names are absent from the frontend bundle. `npm run test:e2e` also passed with captured native exit code 0: 253 passed, 158 skipped, 0 failed (11.9 minutes), including both bundled API restart scenarios.

- Configuration/deploy/cookie suite: 21 tests passed.
- Store/existing auth/config suite: 25 tests passed.
- Durable store, HTTP, distinct-process, route-audit and SDK contract suite: 21 tests passed. This covers separate-process concurrent logins and revocation, atomic competing rotations, password-provider persistence, active credential changes, tampering, capacity, expiry, migration drift and safe storage failure responses.
- Focused Playwright: 3 passed (setup plus desktop/mobile). Each browser starts the complete bundled API, signs in and saves notes, retains its HttpOnly cookie through a real process restart, restores account notes without another login, logs out, restarts again and confirms the original cookie stays revoked. No cookie value appears in localStorage.

The original source-process fixture loaded the whole lab registry and exceeded its startup deadline. The process unit fixture now isolates the actual Express auth boundary, starts in separate Node processes and shares the real session database. The browser scenario continues to exercise the complete bundled application and account progress. No production timeout was increased. A further store regression checks that a failed replacement insert rolls back the old session's revocation.

Required full commands run sequentially:

```sh
npm exec -- cross-env VITEST_MAX_WORKERS=4 npm run verify
npm run test:e2e
```

Native exit codes are captured explicitly in the local ignored `.data/sessions-verify-exit.txt` and `.data/sessions-e2e-exit.txt`; logs use the matching `sessions-verify.log` and `sessions-e2e.log` paths. Use [SESSIONS.md](SESSIONS.md) for operational recovery details.

## Demo

1. Configure `AUTH_SESSION_STORE=sqlite`, a stable signing secret and a persistent data directory locally. Do not paste credentials into source or browser settings.
2. Run `npm run dev`, sign in and open `/labs/lab-00`. Add notes and wait for **Progress saved to your account**.
3. Restart the API with the same configuration and data volume. Reload: the learner remains signed in and account notes restore without another login.
4. Sign out, restart the API again and reload. The learner stays signed out. The automated browser test also verifies that replaying the original cookie is refused.
5. Change an active allowlist, credential or session TTL and restart. Old sessions are refused under that new configuration. Rotating the signing key also invalidates sessions.

## Costs and remaining work

Provider cost: zero. Tests use offline mode; the owned browser-test API receives empty provider-key settings. No dependency, Mastra API or model identifier was added or upgraded. The already-pinned libSQL client 0.18.0 supports the connection-wide busy timeout used here.

SQLite mode requires a supported persistent filesystem, the same database/secret/identity settings across participating processes, and consistent backups. Restoring an older database requires rotating the signing key to prevent revoked credentials from returning. Absolute expiry and the 10,000-row cap are supported; idle-expiry refresh is not.

OIDC/SSO, remote shared sessions, shared rate limits, general multi-replica lab storage, quotas/provider budgets, and HTTP run/token/approval recovery remain separate milestones. Existing request-start authorization for open SSE streams remains unchanged. This milestone does not add offline authentication or cross-tab draft coordination.
