# Tasks

## 1. Implementation

- [x] 1.1 Spikes: MastraStorageExporter + experiments (traceIds), getTrace / listTraces from storage across instances, listScoresByRunId (entityId = item id), result row fields; recorded in design.md
- [x] 1.2 Recording and `buildDashboard` from storage (runs, items, KPIs, regressions, percentiles, traces, empty states); unit tests
- [x] 1.3 `QualityDashboardSchema` contract, web `QualityDashboard` (with SpanTree trace panel and empty states) and tests; RunTab integration
- [x] 1.4 Run, checks, definition, fixtures, solution; lab60.test.ts, conformance, live check

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e` (new e2e spec), Prettier; COMPATIBILITY row

## Workflow follow-up

- Archive, commit and push (only after every check has passed).
