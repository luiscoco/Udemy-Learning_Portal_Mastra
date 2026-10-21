# L61 implementation handoff — 2026-10-19

Resumed the unfinished `lab-61-authenticated-api` change from the existing Claude Code working tree. The established foundation, module order, previous labs and stable lab routes are preserved.

## Delivered files

- `packages/auth/src/{providers,sessions,http}.ts`: server-only identity boundary, local provider, signed bounded sessions, revocation, cookie and origin helpers, login limiter and deployment guard. `auth.test.ts` covers the primitives.
- `apps/api/src/auth.ts`, `app.ts`, `config.ts`, `errors.ts`, `routes/{labs,runs}.ts`: local login/logout/session endpoints, configuration and redaction, authenticated run starts, owner-checked snapshots/SSE/mutations and no-store responses. `auth.test.ts` covers negative paths; existing run, upload and optional live tests now sign in through `test-auth.ts`.
- `packages/contracts/src/{auth,api-error,index}.ts` and `packages/lab-engine/src/runner.ts`: additive auth contracts and private run ownership metadata. Contract and engine tests cover compatibility.
- `apps/web/src/api/auth.ts`, `lib/auth-context.tsx`, `pages/LoginPage.tsx`, `components/layout/SessionStatus.tsx`: session loading, sign-in, safe return navigation, expiry handling, sign-out and header status. `components/workspace/RunTab.tsx` gates execution and handles a 401 from a stale session. Main/router/test helpers integrate the provider. `auth.test.tsx` adds component coverage.
- `packages/labs/src/lab-61/`: complete lesson, real loopback HTTP demo, deterministic expiry clock, 11 objective checks, fixtures, reference source, solution, quiz, hints, challenge and six-minute instructor outline. Catalog and implementation registry include Lab 61 under Module 13.
- `e2e/auth.setup.ts`, `e2e/auth.spec.ts`, `playwright.config.ts`: real HTTP sign-in with a gitignored cookie jar, anonymous tests, return-to-lab, reload, logout and stale-tab behavior on desktop/mobile. Optional live browser projects also depend on sign-in setup.
- `.env.example`, `README.md`, `docs/AUTH.md`, `docs/RELEASE-GATES.md`, `docs/COMPATIBILITY.md`: configuration, HTTP-client migration, demo instructions and remaining deployment gates. ESLint prevents web imports of the server-only auth package. Workspace manifests and the lockfile pin the local package at 0.1.0; no third-party dependency was added or upgraded.

## Validation

- `npx openspec validate lab-61-authenticated-api --strict`: passed before implementation and after artifact clarification.
- Focused Vitest authentication, API, web and Lab 61 checks: passed.
- `npm run verify`: **passed** — environment-example scan, ESLint, strict workspace typechecks, **1,241 tests passed / 56 skipped**, API and web builds, browser-bundle secret scan.
- `npm run test:e2e`: **passed — 196 passed / 3 skipped**, covering desktop and mobile, all released lab examples, authentication, approvals, accessibility and progress.
- `npm run test:e2e -- e2e/auth.spec.ts`: **5 passed** after rebuilding the final HTML username-pattern correction. Focused lint, root/web typechecks and formatting also passed for that correction.
- `npx prettier --write` on changed code and configuration: completed; Markdown is excluded by the repository's existing `.prettierignore`.
- `git diff --check`: passed before final archival.
- Both new main specs (`platform/auth-boundary` and `course-labs/lab-61-authenticated-api`) match the delta requirements and pass individual strict validation. The wider `npx openspec validate --specs --strict` audit found **10 pre-existing placeholder Purpose sections in L51–L60**. Those older specs are unchanged; this is an outstanding strict OpenSpec/CI documentation issue, separate from the passing code checks.

The build reports the existing large-chunk and Tailwind source-map warnings. They do not fail verification. Optional live-provider suites were not executed; authentication was tested in live-enabled server mode without starting a provider call. **No model/provider costs were incurred.**

## Demo

1. Run `npm run dev` and open `http://127.0.0.1:5173/labs/lab-61?tab=run`.
2. Choose **Sign in to continue**, use the configured allowlisted user (default `learner`) and the optional local passcode if set. The browser returns to the lab.
3. Run the example offline and inspect the workflow events, HTTP status output and 11 checks. Change the demo learners or session lifetime and repeat. Use an invented sample only in the optional demo passcode input.
4. Reload to verify the platform session survives a browser reload, then sign out and verify execution is gated again. Learn and Source remain accessible. Progress continues through the existing persisted progress mechanism.

## Limits and follow-up

This ships a local development identity provider and a production auth boundary abstraction. Production startup refuses the development provider; OIDC/SSO and shared durable sessions are not implemented. Sessions end on a process restart. The current run token remains in tab memory, so it is lost on reload. An established SSE response is checked at connection start and is not actively revoked by logout. Threads, documents, suspended workflows and persistent lab storage still need tenant isolation in L62. Per-learner rate limits, provider budgets, HTTPS and the other release gates remain open.

Implementation changes are local; no commit or push was performed.

All eight tasks are complete. Both new capabilities were synced to main specs and compared with their deltas. Standard validation passed all 70 main specs (the older placeholder warnings remain as described above). The completed change is archived at `openspec/changes/archive/2026-10-19-lab-61-authenticated-api/`.
