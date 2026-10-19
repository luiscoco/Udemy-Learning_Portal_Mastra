# Proposal

## Why

L57–L59 produce scores, datasets and comparisons, one run at a time. A team watches quality over time: is the pass rate going up or down, which scenarios broke since the last run, how slow is the agent at the tail, and, for any failure, what actually happened, which needs a link to its trace. A dashboard is only trustworthy if every number is derived from stored runs, and only usable if it still makes sense before the first run.

The DoD asks for a dashboard of eval pass rate, regressions, latency percentiles and trace links, with metrics derived from real fixtures and usable empty states.

## What Changes

- **New lab `lab-60`** (Module 12), on a durable store (`LibSQLStore` at `ctx.services.memory.file('lab-60-quality')`). The Mastra instance has:
  - the L58 `course-faq` dataset (same seed, latest version);
  - the L59 configurations as agents;
  - `observability: new Observability({ … exporters: [new MastraStorageExporter()] })`, so every experiment item's trace is **stored**.
- **Recording a run:** `record-and-show` runs one experiment for the chosen configuration (L58 scorers) and appends it to the history. `show-only` only reads.
- **Dashboard derived from storage** (`dashboard.ts`):
  - the runs: the dataset's experiments from `listExperiments()`, newest last, limited to a window;
  - per-item outcomes: `listScoresByRunId({ runId: experimentId })` from the scores domain (`entityId` = item id; `scenario-assertions` score 1 = pass, and its reason lists the failed assertions);
  - per-item timing and `traceId`: `listExperimentResults`.
- **Per run:** pass rate, item count, errors, and latency p50 / p95 / p99 (nearest rank). The KPIs are the latest pass rate, its change against the previous run, the latest p50 / p95 and the regression count.
- **Regressions:** scenarios that passed in the previous run and fail in the latest, matched by `externalId`; a note appears when the dataset versions differ.
- **Trace links:** each latest-run item and each regression links to its trace. The spans are read from storage with `getTrace({ traceId })` and shown with the L56 `SpanTree`, so the links survive restarts.
- **Empty states:**
  - no dataset yet or no runs: `empty.isEmpty`, with a reason and actions, KPIs as `null`, no NaN;
  - one run only: regressions say "needs two runs";
  - an item without a trace: "trace not recorded".

  An `empty-demo` store (never written) shows the first-use state.
- **Contract:** a new `QualityDashboardSchema` (`output.dashboard`) and a web `QualityDashboard` component (KPI tiles, a run history table with a text trend, regressions, latency percentiles, latest items with trace links that open the span tree, and the empty states).
- **Checks:** `metrics-from-fixtures`, `regressions-detected`, `latency-percentiles`, `trace-links-resolve`, `empty-state-usable`.

## Capabilities

### New Capabilities

- `course-labs/lab-60-quality-dashboard`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-60/` (reuses the L58 seed and scorers, the L59 configurations and metrics, and the L56 span flattening), `packages/contracts/src/quality-dashboard.ts`, `apps/web/src/components/workspace/QualityDashboard.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, registry, COMPATIBILITY row.
- **Modes:** offline (mock provider) and live (one experiment of four scenarios per recorded run).
