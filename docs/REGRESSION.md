# Production regression gates

This page describes the release gates that decide whether a build may ship, how each one is measured, and how to change a threshold or a baseline safely. It covers what L74 added.

```bash
npm run regression                          # all six gates; exits 1 if any gate fails
npm run regression -- --only security,tracing
npm run regression -- --inject load-smoke   # prove that a gate fails on a regression
```

The command is configured by two files:

- **`regression/gates.json`:** the thresholds and the advisory allowlist.
- **`regression/baseline.json`:** the recorded baselines.

Each run writes two files with the commit and time:

- **`regression/evidence/latest.json`:** the full evidence: per-gate metrics, thresholds, findings and durations.
- **`regression/REPORT.md`:** a readable summary.

Injected runs write `regression/evidence/injected-<gate>.json`.

**In CI:** the `regression` job (`.github/workflows/ci.yml`) runs the suite on every push, fails on any failing gate, and uploads the evidence as the artifact `regression-evidence`.

## The gates

| Gate | What it measures | Fails when | Why |
| --- | --- | --- | --- |
| **security** | `npm audit --omit=dev`, plus HTTP checks against the built API in production mode (password sign-in, throwaway secrets) | Any high or critical advisory is not allowlisted; an allowlist entry has expired; any HTTP check fails | Known-vulnerable code and missing protections are release blockers |
| **load-smoke** | 300 `/api/health` requests (16 at a time) and 24 lab-00 runs (8 at a time) against a server limited to 4 concurrent runs. The client retries 429 with backoff, like a well-behaved client. | Health p95 > 100 ms; any health 5xx or network error; any run that never starts or doesn't finish `succeeded`; run p95 > 5000 ms | Overload must degrade to 429, never to 5xx or lost runs |
| **eval-regression** | The 12 L57 golden scorer fixtures, and the L58 Mastra experiment over the course dataset | Any golden fixture changes; the experiment pass rate drops below the baseline minus the tolerance (0); an item that passed in the baseline fails | Silent quality drops in scorers or agents |
| **tracing** | An L56 traced pipeline run (offline) | The span signature (depth, type and name of every span, with ids normalized) differs from the baseline; there isn't exactly one root and one trace; a span exports a stack trace or an absolute path | Broken instrumentation, or a changed pipeline shape, is invisible in production |
| **workflow-recovery** | The real two-process restart tests: L32 resumes a workflow from its checkpoint without re-running side effects; L71 recovers durable data and restores a backup | Any of those tests fails, is skipped, or is missing | Durability claims must hold on every release |
| **accessibility** | axe (WCAG 2.1 A and AA) on every available lab's Learn and Run tab, on desktop | serious > 0, critical > 0, or fewer pages than 2 × available labs | Every learner must be able to use every lab |

The HTTP checks in the security gate are:

- no `X-Powered-By` header;
- `no-store` on auth responses;
- a session cookie that is `HttpOnly; SameSite=Strict; Secure`;
- 401 on anonymous run routes;
- 403 on a cross-origin POST;
- error bodies without stack traces or paths;
- a 429 after repeated failed logins;
- no secret values in the server logs.

## The advisory allowlist

Every entry in `security.allowlist` has an advisory `id` (GHSA), the `package`, a `reason` (an exposure assessment, not "won't fix") and an `expires` date. An expired entry fails the gate, which forces a re-review.

**Current entries (expiring 2026-12-31):** the lower-severity `@hono/node-server` exposure note remains. The former MCP SDK exceptions were removed after the compatible core 1.79.0 / MCP 2.8.0 / client 2.4.0 update. The fresh all-dependency audit reports zero high or critical findings. Lower-severity advisories still require review; do not treat removal of an old exception as proof that every transitive advisory is fixed.

**Fixed in L74:** `body-parser` 2.4.0, `re2js` 2.9.1 and `@hono/node-server` 1.19.18, patched inside the ranges their parents declare. Only those three lockfile entries changed. `npm audit fix` was **not** used, because it would have moved `@mastra/core` 1.78 → 1.81 and 95 other packages.

## Changing a threshold or a baseline

1. **Explain it.** Say in the commit why the old value is wrong, for example "the health p95 grew because we added X, measured Y".
2. **Record a new baseline only from a reviewed run.** Run `npm run regression`, inspect the diff, and update `regression/baseline.json` in the same pull request as the change that caused it.
3. **Re-prove the failure.** Run `npm run regression -- --inject <gate>` once, so the gate is shown to fail with the new values.

**Never raise a threshold just to make a failing build pass.** Fix the regression instead, or allowlist it with a reason and an expiry date.

## Evidence on record

[`regression/REPORT.md`](../regression/REPORT.md) is the latest clean run. The `regression/evidence/injected-*.json` files show each gate failing on its injected regression.

The local course release runs synchronous npm audit before opening regression HTTP connections and drains completed responses to avoid stale pooled sockets. Its disposable load server uses high run-start request allowances so one synthetic account can exercise concurrency/retry capacity; real production quotas stay unchanged and dedicated API/browser rate-limit tests cover them. Concurrency and performance gate thresholds are unchanged.
