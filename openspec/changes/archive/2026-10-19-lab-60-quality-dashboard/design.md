# Design

## Context

Verified in spikes with `@mastra/core` 1.78.0, `@mastra/observability` 1.20.1 and `@mastra/libsql` 1.26.2:

- **Stored traces.** With `observability: new Observability({ configs: { name: { serviceName, exporters: [new MastraStorageExporter()] } } })` and `LibSQLStore` storage:
  - each experiment item gets a `traceId` (`summary.results[i].output.traceId`, and in `listExperimentResults` rows as `traceId`);
  - after `observability.flush()`, `(await storage.getStore('observability')).getTrace({ traceId })` returns `{ traceId, spans: [{ spanId, parentSpanId, name, spanType, startedAt, endedAt, entityType, entityId, error, … }] }`, rooted at the `agent_run` span;
  - a new Mastra instance on the same file reads the same trace, and `listTraces({ pagination })` pages through them.
- **Stored scores.** `(await storage.getStore('scores')).listScoresByRunId({ runId: experimentId, pagination })` returns the experiment's scores with `scorerId`, `entityId` (= the dataset item id), `score` and `reason`. This works for a single experiment, unlike `compareExperiments`, which needs two.
- **Result rows.** `listExperimentResults` rows carry `itemId`, `itemDatasetVersion`, `startedAt`, `completedAt`, `error`, `status` and `traceId`. `listExperiments()` lists the dataset's experiments with `name`, `metadata`, `status`, `datasetVersion` and `startedAt`.

## Decisions

- **Store.** `lab-60-quality` for the course dashboard and `lab-60-empty` (never written, no dataset created) for the empty demo. Operations run under a `KeyedLock` per file.
- **Recording.** `ensureDataset` (L58 seed), then one experiment with the L59 configuration as target, named `run:<configId>` with `metadata { configId, labRunId, modelId }`, then `observability.flush()`. The empty-demo store never records; `record-and-show` on it records nothing and reports that.
- **Reading** (`dashboard.ts`, `buildDashboard(storage, mastra, window)`):
  1. `get` the dataset; if it is not found → empty state `no-dataset`.
  2. List its experiments (completed only), sort by `startedAt`, take the last `window`; with none → empty state `no-runs`.
  3. For each run: the results (`listExperimentResults`) and scores (`listScoresByRunId`); per item `{ externalId, title, passed (assertions score = 1), failedAssertions (✗ entries from the reason), durationMs, traceId, error }`.
  4. Run metrics: total, passed, `passRate`, errored, and p50 / p95 / p99 with the L59 `percentile`.
  5. KPIs from the last two runs. Regressions: latest versus previous by `externalId` (passed → not passed); `null` when there is only one run (`needsTwoRuns`).
  6. Traces: for the latest run's items and the regression items, `getTrace` → L56 `toTraceSpans`-compatible spans (flattened from the stored shape, errors as messages only), at most 40 spans per trace; a missing trace → `null`.
- **Contract** `QualityDashboardSchema`:
  - `{ datasetId, datasetVersion, window, empty: { isEmpty, reason: 'no-dataset' | 'no-runs' | null, message, actions[] } }`;
  - `kpis { runs, latestPassRate, previousPassRate, passRateDelta, latestP50, latestP95, regressions }` (all nullable);
  - `runs[{ experimentId, name, configId, datasetVersion, startedAt, total, passed, passRate, errored, latency: { p50, p95, p99 } }]`;
  - `regressions { needsTwoRuns, items[{ externalId, title, previousExperimentId, latestExperimentId, failedAssertions[], traceId }] }`;
  - `latestItems[{ externalId, title, passed, durationMs, failedAssertions[], traceId, error }]`;
  - `traces: Record<traceId, TraceSpan[]>` (L56 contract);
  - `notes[]`.
- **e2e isolation.** The dashboard spec appends runs to the shared course store and asserts on the last two runs, so it runs in the desktop project only. Run in both projects in parallel, their runs interleaved (desktop failed, mobile passed), and passed alone.
- **Live findings (gpt-5-mini).** Grounded passed 4 of 4 (p50 5.5 s) and no-tools 0.25, giving three regressions; every stored trace resolved with real model spans (grounded traces include `tool_call`).
- **Web** `QualityDashboard`: KPI tiles (with "—" for null and an explanation), a run history table with a text trend (↑ ↓ =), regressions with "Open trace", latency columns, latest items with "Open trace" / "trace not recorded", a trace panel reusing `SpanTree`, and the empty state as a status message with the actions listed.
