# Release gates: before exposing the platform publicly

The platform is built and tested for a single learner on a trusted machine (the API listens on `127.0.0.1`). The items below are **required** before it is reachable by other people, for example on a public host or a classroom network. Labs keep being added in the meantime. These gates block deployment, not lab development.

Status key: ☐ open · ☑ done

## 1. Run authorization (highest priority)

What exists today:

- `POST /api/labs/:labId/runs` returns a secret `runToken`.
- Cancel and approval decisions require it (`X-Run-Token`, constant-time check, 403 otherwise).
- Waiting runs are capped (`MAX_PENDING_APPROVALS`).

What is still required:

- ☐ **Real learner identity.** Add sign-in, a session cookie or OIDC, and bind every run to the learner who started it. Today the token protects each run, not each person.
- ☐ **Protected reads.** Require the token, or the owning session, for `GET /api/runs/:runId` and `GET /api/runs/:runId/events`. Events contain tool arguments and model output.
- ☐ **Token survives a reload.** Keep the run token in the learner's session server-side, or in `sessionStorage` per tab after a threat review. Today a reload loses it.
- ☐ **Rate limits.** Add per-learner and per-IP limits on run starts and decisions, in addition to the global `MAX_CONCURRENT_RUNS`.
- ☐ **Live-mode cost caps.** Set per-learner budgets for live provider calls, and decide whether learners bring their own keys or share the server's.

## 2. Durable state

- ☐ **Persistent storage adapter.** Introduce it with the memory labs (L21–L23) through its own OpenSpec change. Paused approval runs and conversation history must survive a restart.
- ☐ **Learner progress on the server.** Progress is in browser storage today. Move it server-side if learners switch devices.

## 3. Hosting hardening

- ☐ **HTTPS only.** Add security headers (CSP, HSTS, `X-Content-Type-Options`) and restrict CORS to the web origin.
- ☐ **Secrets.** Keep provider keys in the host's secret store, not a `.env` file. Rotate any key that was ever committed. The 2026-10-17 incident was caught before it was pushed, but rotate anyway.
- ☐ **Monitoring.** Add structured logs shipped off-host, with alerting on 5xx rates and provider errors.

## 4. Code execution

- ☐ **Sandbox for learner code.** Learner-submitted code never runs in the API process (master rule). Any future remote execution needs an isolated sandbox with no network and with CPU, memory and time limits.

## 5. Dependencies

- ☐ **Re-run `npm audit` on every Mastra upgrade.** The remaining advisories come through `@mastra/core` (gray-matter → js-yaml) and the dev-only `mastra` CLI, with no fixed releases as of 2026-10-17. See [COMPATIBILITY.md](COMPATIBILITY.md#known-issues).
