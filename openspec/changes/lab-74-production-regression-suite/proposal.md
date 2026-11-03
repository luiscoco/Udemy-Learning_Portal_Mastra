# Proposal

## Why

The L74 definition of done: "Run security, load-smoke, eval regression, tracing, workflow recovery and accessibility CI checks. Documented gates fail on regressions; real evidence recorded."

The platform already has many tests, but no single place states the release gates, their thresholds and their baselines, and nothing records evidence per release. A production audit found real problems:

- **5 high and 2 moderate production advisories.**
  - **Patched within the declared ranges:** `body-parser` 2.3.0 → 2.4.0 (via express), `re2js` 2.8.6 → 2.9.1 (via `@mastra/core`) and `@hono/node-server` 1.19.17 → 1.19.18. Three lockfile entries changed, with no framework version change.
  - **Remaining:** six MCP SDK advisories. They need `@mastra/mcp` 2.7.0, which requires `@mastra/core` ≥ 1.79, while the platform is pinned and tested on 1.78.0.
- **`npm audit fix` is unsafe here.** It would have silently moved `@mastra/core` to 1.81.0 along with 95 other packages, so it was not used.

## What Changes

- **`regression/gates.json`:** the documented gates, with thresholds and the advisory allowlist. Each allowlist entry has a GHSA id, the package, an exposure assessment and an expiry date; an expired entry fails the gate.
- **`regression/baseline.json`:** the recorded baselines for the eval and tracing gates.
- **`packages/labs/src/lab-74/gates.ts`:** pure, tested gate evaluators. Each returns `{ gate, status: pass|fail, metrics, thresholds, findings[] }`.
- **`scripts/regression.ts` (`npm run regression`)** measures each gate for real:
  1. **security:** `npm audit --omit=dev`, failing on high/critical advisories not on the allowlist, plus HTTP checks against a locally started production-mode server:
     - no `X-Powered-By`;
     - `no-store` on session and run responses;
     - anonymous run routes answer 401;
     - a cross-origin POST answers 403;
     - the login rate limit answers 429;
     - cookie flags `HttpOnly; SameSite=Strict`;
     - no stack traces in error bodies.
  2. **load-smoke** against the same server:
     - 300 `/api/health` requests, 16 at a time: p95 must be under 100 ms with zero 5xx;
     - 24 lab-00 runs, 8 at a time: zero 5xx, every accepted run completes `succeeded`, overload answers 429 (never 500), p95 time to complete under 5 s.
  3. **eval-regression:** every L57 golden scorer fixture must match exactly, and the L58 offline experiment's pass rate and per-item results must match the baseline (tolerance 0, deterministic).
  4. **tracing:** an L56 offline run's span signature (sorted type/name pairs plus parent structure) must equal the baseline, with exactly one root span, all spans on one trace, and no stack traces or absolute paths in the spans.
  5. **workflow-recovery:** the real two-process restart tests must pass (L32 workflow resume from a checkpoint, L71 durable data and restore).
  6. **accessibility:** an axe sweep of every available lab's Learn and Run tabs (desktop), with zero serious or critical violations.

  The script writes the evidence to `regression/evidence/latest.json` and `regression/REPORT.md` (commit, time, per-gate metrics) and exits 1 when any gate fails. `--inject <gate>` simulates a regression for that gate, to show that it fails.
- **CI:** a `regression` job runs the suite on every push and uploads the evidence.
- **`docs/REGRESSION.md`:** each gate, why it exists, its threshold, how to update a baseline (review required) and how to add an allowlist entry.
- **New lab `lab-74` (Module 15): "Production regression suite".** The learner edits thresholds and injects regressions.
  - **Offline:** gates are evaluated on the recorded evidence, while the eval and tracing gates are measured fresh in-process.
  - **Live:** a real-model eval check: the L57 scorer scores an answer written by a live model, against a threshold.
- **Dependencies:** the three patched transitive packages above (lockfile only).
