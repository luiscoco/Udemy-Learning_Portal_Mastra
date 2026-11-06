# Development startup fix

Date: 2026-11-06. Change: `dev-startup-readiness`.

## Observed problem and fix

Vite advertised its URL before the API listened, causing ECONNREFUSED on health and session requests. Standalone source-loader startup completed in about 33 seconds; combined-command source-loader trials also stalled beyond the 120-second readiness bound. Those timed-out trials were not counted as successful starts.

The API development script now uses the already installed tsup bundler in watch mode for API source and shared packages, restarting the built server after successful builds. Root development startup waits for `/api/ready` before launching Vite. Waiting is visible, bounded to 120 seconds, cancellable, and each request has its own timeout. Either supervised command exiting stops its companion. Server configuration is validated and an initialization stage logged before importing the full application.

Only HOST, PORT and API_PROXY_TARGET are selected from the effective API dotenv file. Shell values take precedence; wildcard API bind addresses become loopback connection addresses. The resolved origin is passed consistently to readiness and Vite. Provider/configuration secrets and their mounted-file paths are removed from Vite's inherited environment. No dotenv secret values are copied into it. HTTPS proxy targets use the appropriate keep-alive agent.

## Changed paths

- `package.json`, `apps/api/package.json`: root supervision, readiness wrapper and API bundle watch.
- `scripts/dev-web.ts`, `tsconfig.tools.json`: bounded readiness, proxy resolution, cancellation and secret filtering, included in strict typechecking.
- `apps/api/src/server.ts`: early configuration validation/progress and dynamic application import.
- `apps/web/vite.config.ts`: protocol-appropriate upstream agent.
- `packages/deploy/src/dev-startup.test.ts`: six regression tests; included in the existing Windows/Linux/macOS tooling CI matrix in `.github/workflows/ci.yml`.
- `README.md`, `docs/STUDENT-GUIDE.md`: setup, expected waiting, custom ports and troubleshooting.
- `openspec/specs/dev-foundation/spec.md`: updated standard development command behavior; proposal/design/tasks/delta in the archived change.

## Commands and actual results

- `npx vitest run packages/deploy/src/dev-startup.test.ts`: 6 passed. Covers server-secret filtering, dotenv precedence and custom origins, sanitized invalid settings, refused connections, malformed JSON, non-ready responses, hanging requests and cancellation.
- `npx tsc -p tsconfig.tools.json`: passed after correcting the environment-map index type.
- `npm run dev`: bundled watch startup passed. API initialization logged at 09:30:41 UTC, listening at 09:30:43 UTC; Vite's URL appeared afterward. Proxied `/api/health` returned `ok` and `/api/auth/session` returned successfully.
- Shared-package watch smoke: touching `packages/contracts/src/health.ts` without changing its contents triggered a rebuild (868 ms), restarted the API and restored healthy proxied responses. Stopping the root command released ports 8787 and 5173. The smoke log is `.data/dev-startup-smoke.log`.
- `npm run verify`: exit 0; 154 test files passed, 2 skipped; 1,699 tests passed, 69 skipped. Environment/spec checks, lint, strict types, build and bundle-secret scan passed. The scan confirmed both locally configured secret values and seven secret key names absent from frontend output. Evidence: `.data/dev-startup-verify.log` and `.data/dev-startup-verify-exit.txt`.
- `npm run test:e2e`: exit 0; 259 passed, 158 skipped, zero failures, 9.6 minutes. Evidence: `.data/dev-startup-e2e.log` and `.data/dev-startup-e2e-exit.txt`.
- `npx openspec validate --specs --strict --no-interactive`: all 90 main specs passed after syncing the delta.

These results are local Windows evidence. The expanded CI matrix is configured but no remote execution of this new fix is claimed. Existing non-failing frontend chunk-size and Tailwind sourcemap warnings remain. No dependencies or lockfile versions changed. No paid provider calls were performed; provider cost was $0.

## Demo and limits

Stop an existing development command with Ctrl+C. From the repository root run `npm run dev`; wait for `[dev] API ready` and Vite's `Local` URL, then open `http://127.0.0.1:5173` and sign in as `learner`. No reinstall or credential changes are needed for this fix. Changing PORT in `.env` is picked up on root-command restart.

Direct workspace web startup intentionally bypasses the readiness gate. During a later API rebuild, an already open browser can briefly lose its API connection; wait for `api listening` and refresh if needed. Startup gating does not add automatic browser retries during those later rebuilds. Full installation drills on other operating systems and remote CI remain separate evidence.
