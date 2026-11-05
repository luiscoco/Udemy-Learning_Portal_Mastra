# HTTP run recovery implementation

Date: 2026-11-05. OpenSpec change: `recover-http-runs`.

All six tasks are complete. Both delta specs were synced into the main specifications before full verification. The change is archived at [2026-11-05-recover-http-runs](../openspec/changes/archive/2026-11-05-recover-http-runs/proposal.md); archive used `--skip-specs` because the main specs were already merged.

## Behavior and activation

Standard Run tabs restore remembered executions after reload and offer **Recover latest run**. The owner obtains a fresh mutation capability; sessionStorage contains only the account/lab-scoped run ID. Cancellation and pending approvals remain usable after a live reattachment. Historical terminal replay does not rewrite learner progress, including a deliberate reset.

Memory remains the default. Set `RUN_STORE=sqlite` with a separate stable `RUN_STORE_SECRET` (or `_FILE`) and persistent `MLP_DATA_DIR` to retain redacted HTTP snapshots and events across API restarts. Configure durable sessions independently if the same cookie must survive that restart. See [RUN-RECOVERY.md](RUN-RECOVERY.md) for limits, key handling, retention and API contracts.

Initial metadata commits before lab code runs; normal events commit before SSE publication. The journal retains capability hashes only and verifies keyed metadata and event chains. A lifetime SQLite lock refuses another active runner before touching existing executions. Startup finalizes orphaned work as failed, with zero actionable approvals and an explicit interruption error. It never invokes the old continuation or fabricates a human decision. The original start capability remains valid; at most four additional recovery capabilities are retained.

## Changed files

| Area | Paths |
| --- | --- |
| Optional engine boundary and safe recovery | `packages/lab-engine/src/persistence.ts`, `runner.ts`, `index.ts`, `persistence.test.ts` |
| SQLite journal, migration/integrity/retention and real process fixtures | `apps/api/src/run-journal.ts`, `run-journal.test.ts`, `run-journal-process.test.ts`, `run-journal-process.fixture.ts` |
| HTTP integration and authorization | `apps/api/src/app.ts`, `routes/runs.ts`, `route-classes.ts`, `run-recovery.test.ts`, `routes.audit.test.ts`, `contract.test.ts` |
| Additive contracts, configuration and SDK | `packages/contracts/src/events.ts`, `packages/deploy/src/schema.ts`, `packages/client/src/client.ts`, `routes.ts`, `.env.example`, `apps/api/src/config.test.ts` |
| Account-scoped browser recovery | `apps/web/src/api/runs.ts`, `features/run/run-pointer.ts`, `useLabRun.ts`, `run-state.ts`, `run-recovery.test.tsx`, `components/workspace/RunTab.tsx`, `test-setup.ts` |
| Bundled browser crash/reload scenarios | `e2e/run-recovery.spec.ts` |
| Exact dependency and frontend secret scan | `apps/api/package.json`, `package-lock.json`, `scripts/check-bundle-secrets.mjs` |
| Operations and specifications | `README.md`, `docs/RUN-RECOVERY.md`, `AUTH.md`, `COMPATIBILITY.md`, `DEPLOYMENT-CONFIG.md`, `RETENTION.md`, `RELEASE-GATES.md`, `openspec/specs/lab-execution/spec.md`, `openspec/specs/lesson-workspace/spec.md` |

## Verification

Focused engine/persistence coverage passed 35 tests. Journal plus engine coverage passed 42 tests. Journal and separate-process coverage passed 8 tests, including competing-runner exclusion, process death during approval and no former continuation. HTTP, SDK, route-audit and configuration coverage passed 18 tests. Initial browser controller, chat/workspace and reducer coverage passed 36 tests; an additional input/token-storage regression is included in the final full suite.

`npm run test:e2e -- e2e/run-recovery.spec.ts` passed 3 tests (setup, desktop and mobile). Each browser verifies reload/cancel and reload/approve, read-only historical recovery after progress reset, reset/latest discovery, a real API kill/restart during approval, retained completed output, rejected late decisions and no synthetic approval/result events. Exactly four explicit run starts occur; recovery never adds another.

`npm exec -- cross-env VITEST_MAX_WORKERS=4 npm run verify` passed with captured native exit code 0: 1,656 tests passed, 69 skipped; 148 test files passed, 2 skipped. All 89 main specifications, lint, strict types, environment checks, API/web builds and production bundle secret scanning passed. The scan confirmed both configured secret values and all seven checked key names are absent from the frontend bundle. Vitest completed in 252.35 seconds.

The complete confirmation `npm run test:e2e` suite passed with captured native exit code 0: 255 passed, 158 skipped, zero failed (10.0 minutes). This includes both new desktop/mobile reload and actual API crash scenarios. The commands ran sequentially, without overlapping the full verification and browser suites.

The first complete browser pass recorded 253 passed, 158 skipped and two desktop transport failures before lab execution: Lab 46's definition request timed out and Lab 47 navigation reported `ERR_NETWORK_IO_SUSPENDED`. The targeted rerun (`npm run test:e2e -- e2e/labs.spec.ts --grep 'lab-(46|47)'`) passed all five cases (setup plus both labs on desktop/mobile), exit 0. No application code, test timeout or retry policy was changed to conceal these failures. The subsequent complete confirmation run passed as recorded above.

## Demo

1. Configure the journal and durable sessions as described above, build/start the API and sign in.
2. Open `/labs/lab-15?tab=run`, select its approval scenario, run and reload while waiting. Approve or cancel the same execution.
3. Start another approval run and terminate the API process abruptly. Restart against the same data directory and keys; reload to inspect its explicit failed/interrupted history. Late decisions return conflict.
4. Open Lab 00, complete a run, reset learner progress and reload. The old result restores while the progress reset remains. Reset the run view, then use **Recover latest run** to rediscover it.

## Costs and remaining limits

Provider cost for this milestone: zero; all checks use offline models. No Mastra versions changed. The API directly pins the already installed `libsql` 0.5.29 synchronous driver.

Recorded-state recovery does not resume JavaScript closures or guarantee exactly-once external effects. Native L32/L33 workflow snapshots retain their separate resume controls. Chat/workspace live bubble reattachment, distributed runners, remote shared storage, off-host backup/rollback protection, OIDC, rate limits and provider dollar budgets remain open release gates. This work does not enable public hosting. Local journal keys must remain available; key loss or tampering fails closed.
