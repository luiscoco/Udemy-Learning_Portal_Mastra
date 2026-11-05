# Durable learner progress implementation

Date: 2026-11-05. Change: `durable-learner-progress`.

OpenSpec: all seven tasks completed; `platform/learner-progress` and `lesson-workspace` synced to the main specifications. Archived at [`2026-11-05-durable-learner-progress`](../openspec/changes/archive/2026-11-05-durable-learner-progress/proposal.md). Archive used `--skip-specs` because the deltas had already been merged and validated.

## Result

Signed-in learners recover complete progress, predictions, notes, self-checks and quiz results from another browser. The API stores account-owned records durably. The browser retains queued edits during a progress-service outage, shows save failures, and asks which version to keep when another device has changed the same lab. Confirmed resets retain revision markers so legacy browser records cannot undo them.

## Changed areas

| Area | Files |
| --- | --- |
| Validated contracts and normalization | `packages/contracts/src/progress-api.ts`, exported from `src/index.ts` |
| Storage, migrations and revision checks | `apps/api/src/progress-store.ts` |
| Authenticated routes and body limits | `apps/api/src/routes/progress.ts`, `apps/api/src/app.ts`, `apps/api/src/route-classes.ts` |
| Typed browser SDK and route coverage | `packages/client/src/client.ts`, `packages/client/src/routes.ts` |
| Cache, outbox, migration and account guards | `apps/web/src/lib/synced-progress-store.ts`, `progress-store.ts`, `progress-actions.ts`, `progress-scope.tsx` |
| Status, conflicts, backups and integration | `apps/web/src/components/ProgressSyncNotice.tsx`, `components/layout/AppShell.tsx`, `main.tsx`, `pages/LabPage.tsx` |
| Asynchronous field restoration and confirmed reset | `apps/web/src/components/workspace/LabWorkspace.tsx`, `LearnTab.tsx`, `ReflectPanels.tsx` |
| Browser scenarios and isolated fixtures | `e2e/progress.spec.ts`, `e2e/progress-helpers.ts`, `workspace.spec.ts`, `shell.spec.ts`, `smoke.spec.ts`, `playwright.config.ts` |
| Dependency | Exact `@libsql/client` 0.18.0 in `apps/api/package.json`; the lockfile adds only that direct dependency, with no upgrades |
| Operations and compatibility | `docs/PROGRESS.md`, `AUTH.md`, `RETENTION.md`, `RELEASE-GATES.md`, `COMPATIBILITY.md`, `README.md` |

Lab 75 and its earlier implementation files remain unchanged by this milestone. Existing lesson IDs, routes, completion rules and the synchronous progress-store interface remain compatible.

## Verification evidence

Both required commands passed with captured native exit code 0. Run them sequentially on this machine.

- `npm exec -- cross-env VITEST_MAX_WORKERS=4 npm run verify`: 1,619 tests passed, 69 skipped (140 test files passed, 2 skipped); lint, strict types, builds, environment checks and all 89 main specifications passed. The production browser bundle scan confirmed both configured secret values and all six checked key names are absent.

- `npm run test:e2e`: 251 passed, 158 skipped, 0 failed (10.1 minutes); all ten new progress cases passed across desktop and mobile.
- Focused API/contracts suite: 19 tests passed, covering authentication, account mismatch, request bounds, SDK contracts, checked migrations, competing writes, stale resets, idempotent import and distinct-process recovery.
- Focused workspace/store/UI suite: 30 tests passed, covering asynchronous restoration, offline outbox reload, migration, conflicts, late responses and storage failure. A further regression test covers a late update/reset captured before account switching.
- Focused Playwright workspace/progress/shell run: 41 passed, 2 skipped. New progress scenarios run on both desktop and mobile; conflict controls have no serious or critical axe violations.
- Strict main-spec validation: 89 passed, 0 failed.

The initial broad browser run exposed the home smoke test's shared-account assumption (249 passed, 2 failed, 158 skipped): previous tests had saved progress, so the home link correctly said Continue. That test now uses a fresh anonymous browser. Progress-sensitive authenticated fixtures use distinct accounts per project and run; they never clear another test's server records or revoke its setup session.

A subsequent broad run passed 250 cases, including both corrected smoke tests and all progress scenarios, but Lab 01's real compiler hit the existing server timeout on desktop while workspace typechecks ran concurrently. Its mobile case passed. The final browser run started after `verify` finished and passed all 251 cases with the existing lab timeouts and checks unchanged; Lab 01 desktop passed in 12.9 seconds. The first complete `verify` had also passed every check; PowerShell reported a wrapper status of 1 after warning output, so the final command explicitly captures and propagates `$LASTEXITCODE` (0).

Local ignored evidence lives in `.data/progress-verify-final.log`, `.data/progress-verify-exit.txt`, `.data/progress-spec-validation.log` and `.data/progress-e2e-serial.log` / `.data/progress-e2e-exit.txt`.

## Demo

1. Run `npm run dev`, sign in as `learner`, and open `/labs/lab-00`.
2. Add a prediction and notes, mark the lesson read, run the offline example and pass the quiz. Wait for **Progress saved to your account**.
3. Open a separate browser, sign in to the same account and check the restored fields and completion. After an API restart, sign in again to verify durable recovery.
4. Block only `/api/progress` requests while keeping authentication and the app reachable. Edit notes, reload, then restore requests and choose **Retry progress sync**. The draft remains available and is saved or shown as a conflict.
5. Temporarily block progress requests in browser B and edit its notes. Edit the same lab in browser A and wait for its account save. Restore B's requests and choose **Retry progress sync**: the stale draft produces a conflict. Choose **Use saved progress** or **Keep this device’s changes** explicitly.
6. Choose **Reset this lab’s progress**, then **Confirm reset**. Reload: the lab stays reset even if its original v1 browser records are still present. Legacy records remain exportable through **Download device backup**.

## Costs, limits and remaining work

This implementation and its verification make no live provider calls: provider cost is zero. No Mastra package, method or model identifier changes.

Progress uses local tenant libSQL files and requires a persistent data volume with consistent backups. Shared durable sessions, OIDC/SSO, HTTP run/approval recovery, quotas, provider budgets and multi-replica storage remain separate release gates. Sessions are still in memory and require sign-in after restart. Progress is learner-reported tracking, not certification or authorization.

This adds recoverable progress-service outages, not an offline app shell or offline authentication. Private cache restoration requires a verified session. If browser storage is unavailable, offline durability is impossible; the UI instructs the learner to keep the tab open until the account save succeeds. Whole-record conflicts require a learner choice; automatic field merging is not implemented. See [PROGRESS.md](PROGRESS.md) for API and recovery details.

Concurrent offline drafting in multiple tabs of the same browser is unsupported: those tabs share an account cache/outbox without cross-tab write coordination. Use one editing tab per account while offline. Cross-tab draft coordination remains an open enhancement; server revision checks cover competing device writes.
