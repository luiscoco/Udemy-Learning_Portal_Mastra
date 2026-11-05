# Run request admission implementation

Date: 2026-11-05. OpenSpec change: `limit-run-requests`.

All four tasks are complete. The delta was synced into the main specification before full verification. The change is archived at [2026-11-05-limit-run-requests](../openspec/changes/archive/2026-11-05-limit-run-requests/proposal.md); archive used `--skip-specs` because the main spec was already merged.

## Result

The API now enforces configurable per-learner and per-client-network request allowances. Run starts and approval/recovery controls have independent windows. Canonical retryable HTTP 429 responses include Retry-After and a readable wait message. Cancellation, reads and SSE remain available. Authentication and run ownership precede admission, and refusals cannot start work, settle an approval or issue a capability.

The atomic limiter uses a monotonic clock and a bounded 10000-entry table, with no active-state eviction. It normalizes mapped IPv4 and groups IPv6 addresses by /64. Rejected attempts spend neither bucket and do not slide the window. Configured proxy trust controls the address source. All implementation is application-owned; Mastra and package versions are unchanged.

Settings, defaults, algorithm, deployment considerations and a manual demonstration are in [RATE-LIMITS.md](RATE-LIMITS.md). The broad Playwright host explicitly uses high allowances; a separate low-limit API exercises actual throttling on desktop/mobile. There is no environment-specific bypass in production code.

## Changed files

| Area | Paths |
| --- | --- |
| Atomic limiter and network normalization | `apps/api/src/run-rate-limit.ts`, `run-rate-limit.test.ts` |
| Route integration and HTTP/SDK regression coverage | `apps/api/src/app.ts`, `routes/labs.ts`, `routes/runs.ts`, `run-rate-http.test.ts` |
| Validated settings and public diagnostics | `packages/deploy/src/schema.ts`, `.env.example`, `apps/api/src/config.test.ts` |
| Browser coverage and catalog-test allowances | `e2e/run-rate-limits.spec.ts`, `playwright.config.ts` |
| Operations and compatibility | `README.md`, `docs/RATE-LIMITS.md`, `AUTH.md`, `COMPATIBILITY.md`, `DEPLOYMENT-CONFIG.md`, `RELEASE-GATES.md` |
| Behavior contract | `openspec/specs/lab-execution/spec.md` |

## Verification

Focused limiter tests passed 15 cases, including exact expiry, longest wait, atomic rejection, capacity reclamation, family/account/network isolation and IPv4/IPv6 equivalence. Focused HTTP/configuration/route-audit/SDK coverage passed 40 tests across five files. These verify shared subjects across logins and labs, spoofed headers, trusted proxy behavior, concurrent admissions, canonical 429 headers, preserved pending approvals, unaffected cancellation/replay, and no SDK mutation retries. Type checking caught route-parameter inference and a test cookie-header typing issue; both were corrected before final verification.

`npm exec -- cross-env VITEST_MAX_WORKERS=4 npm run verify` passed with captured native exit code 0: 1680 tests passed, 69 skipped; 150 test files passed, 2 skipped. All 89 main specifications, lint, strict types, environment checks, API/web builds and production bundle secret scanning passed. Both configured secret values and all seven checked key names were absent from the frontend bundle. Vitest completed in 291.27 seconds. An initial verification attempt caught a type-only import lint violation in the new SDK test; it was corrected before this successful full run.

The required complete confirmation `npm run test:e2e` passed with captured native exit code 0: 257 passed, 158 skipped, zero failed (7.4 minutes). This includes the new desktop/mobile throttling scenarios and both session/crash recovery suites. Full verification and browser execution ran sequentially.

The first complete browser run recorded 256 passed, 158 skipped and one existing desktop session-restart timeout. Its trace shows a 136.8-second gap between browser operations during API restart; a status tool call also stalled for several minutes during this session. The targeted session rerun (`npm run test:e2e -- e2e/session-persistence.spec.ts`) passed setup and both desktop/mobile cases, exit 0, with the scenarios taking about ten seconds each. Both new throttling cases passed in the original full run. No application code, timeout or retry policy was changed to conceal the interruption. The full confirmation run then passed as recorded above; the desktop session scenario completed in 12.9 seconds.

Focused browser coverage (`npm run test:e2e -- e2e/run-rate-limits.spec.ts`) passed three cases (setup, desktop and mobile), native exit 0. It uses real server admission responses and checks both limit families, the accessible wait messages, pending-state preservation, cancellation, replay and exactly two explicit starts (one admitted, one refused), with no mutation retries or extra execution.

## Costs and remaining gates

Provider cost: zero; all scenarios run offline. No new dependencies or lockfile changes are required by this milestone. These counters reset when the API restarts and are not shared among instances. Shared/distributed admission, provider dollar budgets, upload/voice quotas, unauthenticated gateway protection, OIDC and remaining public-host controls stay open. A fixed window permits bursts around expiry; concurrency, approval capacity, timeout and body-size caps remain necessary.
