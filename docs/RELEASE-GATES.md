# Release gates: before exposing the platform publicly

The platform is built and tested for a single learner on a trusted machine (the API listens on `127.0.0.1`). The items below are **required** before it is reachable by other people, for example on a public host or a classroom network. Labs keep being added in the meantime. These gates block deployment, not lab development.

Status key: ☐ open · ☑ done

## 1. Run authorization (highest priority)

What exists today:

- `POST /api/labs/:labId/runs` returns a secret `runToken`.
- Cancel and approval decisions require it (`X-Run-Token`, constant-time check, 403 otherwise).
- Waiting runs are capped (`MAX_PENDING_APPROVALS`).
- ☑ **Tenant isolation (L62).** Threads, document libraries, saved files, datasets, experiments and workflow snapshots are partitioned per authenticated learner under `memory/tenants/<sha256 prefix>/`. A route audit test classifies every API route as public or tenant-scoped and checks 401/404 for anonymous callers and other learners. Legacy shared data is migrated only explicitly. See [AUTH.md](AUTH.md#tenant-isolation-l62).
- ☑ **Development identity and run ownership (L61).** Local allowlisted sign-in issues a signed HttpOnly session cookie. Every HTTP run is bound to its authenticated learner; reads and mutations enforce that owner. Development login refuses production and non-loopback startup. See [AUTH.md](AUTH.md).
- ☑ **Protected run reads (L61).** Snapshot and SSE requests require the owning learner; anonymous requests return 401, another learner's run returns 404.

What is still required:

- ☐ **Production learner identity and sessions.** Implement a real identity provider (OIDC/SSO) and shared durable sessions. L61's development identity adapter and in-memory store are not public-host authentication. Sessions end on process restart.
- ☐ **Token survives a reload.** Keep the run token in the learner's session server-side, or in `sessionStorage` per tab after a threat review. Today a reload loses it.
- ☐ **Rate limits.** Add per-learner and per-IP limits on run starts and decisions, in addition to the global `MAX_CONCURRENT_RUNS`.
- ☐ **Live-mode cost caps.** Set per-learner budgets for live provider calls, and decide whether learners bring their own keys or share the server's.

## 2. Durable state

- ☐ **Persistent storage adapter.** Partly done.
  - ☑ **Conversation history** is durable since L21: `@mastra/libsql` on local files via `services.memory`. Its survival across a real process restart is covered by an integration test.
  - ☑ **Suspended workflow runs** are durable since L32: Mastra snapshots in libSQL (`lab-32-workflows.db`). Resuming in a new process is covered by an integration test.
  - ☑ **Durable approvals** are available since L33. A workflow gate suspends with a deadline, and decisions, expiry sweeps and late or duplicate approvals all work across restarts. This is the pattern to use for any approval that matters.
  - ☐ **In-run approval prompts** (`ctx.requestApproval`, used by L15 tool approvals and L33 `ask`) still wait in memory, and a restart loses the prompt. In L33 the refund itself stays suspended in storage and can still be decided or expired. Move L15-style tool approvals onto the same pattern before relying on them in production.
  - ☑ **Workflow run ownership (L62).** Each learner's workflow snapshots live in their own storage partition (`memory/tenants/<partition>/`), so a run id from another learner resolves to nothing. Every HTTP run is owner-bound (L61). This covers the local single-process deployment; a shared remote database needs the same scoping per tenant.
  - ☐ **Hosting.** A public host needs a remote libSQL/Turso or Postgres adapter, with backups, instead of local files.
  - ☐ **Vector stores across processes.** Local libSQL vector files are serialised per process only (`withVectorStore`). Concurrent writers from several API processes would miss vectors. Use a server-side vector database, or a single writer, before scaling out.
- ☐ **Learner progress on the server.** Progress is in browser storage today. Move it server-side if learners switch devices.

## 3. Hosting hardening

- ☐ **HTTPS only.** Add security headers (CSP, HSTS, `X-Content-Type-Options`) and restrict CORS to the web origin.
- ☐ **Reverse proxy and the origin check.** The CSRF origin check compares `Origin` with `req.protocol` and `Host`. Behind a TLS-terminating proxy, set Express `trust proxy` to the proxy's address, or same-origin HTTPS requests are refused as cross-origin.
- ☐ **Secrets.** Keep provider keys in the host's secret store, not a `.env` file. Rotate any key that was ever committed. The 2026-10-17 incident was caught before it was pushed, but rotate anyway.
- ☐ **Monitoring.** Add structured logs shipped off-host, with alerting on 5xx rates and provider errors.

## 4. Code execution

- ☐ **Untrusted documents (from L36).** Uploads are size-limited, sniffed and parsed in the API process with pdf.js: no code generation, page, character and time limits. Before public exposure, add:
  - per-learner upload quotas and rate limits;
  - malware scanning of accepted files;
  - a separate worker process or sandbox for PDF parsing, so a pathological file cannot stall the API;
  - ☑ per-learner document libraries (L62): each learner's library lives in their own partition.
- ☐ **Sandbox for learner code.** Learner-submitted code never runs in the API process (master rule). Any future remote execution needs an isolated sandbox with no network and with CPU, memory and time limits.

## 5. Dependencies

- ☐ **Re-run `npm audit` on every Mastra upgrade.** The remaining advisories come through `@mastra/core` (gray-matter → js-yaml) and the dev-only `mastra` CLI, with no fixed releases as of 2026-10-17. See [COMPATIBILITY.md](COMPATIBILITY.md#known-issues).
