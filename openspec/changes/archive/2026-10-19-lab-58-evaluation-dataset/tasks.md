# Tasks

## 1. Implementation

- [x] 1.1 Spikes: datasets on memory and LibSQL, versions, externalId idempotency and conflicts, metadata updates, experiments and pinning, scorer input shape for agent targets, persistence; recorded in design.md
- [x] 1.2 L57 `createRubricScorer` options (`answerOf`, `rubricOf`), additive with defaults
- [x] 1.3 Seed revisions and `ensureDataset` under a file lock; scorers (rubric adapter, assertions); target agent; runner; unit tests
- [x] 1.4 `EvalReportSchema` contract, web `EvalReport` with tests, RunTab integration
- [x] 1.5 Run, checks, definition, fixtures, solution; lab58.test.ts, conformance, live check

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e` (new e2e spec), Prettier; COMPATIBILITY row

## Workflow follow-up

- Archive, commit and push (only after every check has passed).
