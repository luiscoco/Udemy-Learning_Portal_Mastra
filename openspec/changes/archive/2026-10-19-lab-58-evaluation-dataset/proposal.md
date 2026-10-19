# Proposal

## Why

A scorer (L57) measures one answer. Measuring an agent needs a dataset: a stable, versioned set of scenarios with their inputs and expected assertions, and a runner that executes the agent on every scenario and records the results. Versions matter because the dataset changes: when a scenario is added or an assertion is tightened, older results must stay comparable to the version they ran against. The runner must also work in CI without an external LLM.

The DoD asks for versioned scenarios, inputs and expected assertions in storage, a runner, and a dataset that can run without an external LLM via the mock provider.

## What Changes

- **New lab `lab-58`** (Module 12), built on Mastra's native datasets (`@mastra/core` 1.78.0):
  - `mastra.datasets` (`DatasetsManager`) and `Dataset` (items, versions, item history, experiments);
  - storage in `LibSQLStore`, in a lab memory file (`ctx.services.memory.file('lab-58-datasets')`), so the dataset and its experiments survive restarts.
- **Versioned seed** (`scenarios.ts`, checked in): dataset `course-faq` built from numbered revisions, applied idempotently and in order.
  - Revision 1 adds three scenarios (`workflow-steps`, `suspend-resume`, `tool-validation`).
  - Revision 2 adds an `out-of-scope` scenario and tightens the `tool-validation` assertions with `updateItem`.

  Each item has an `externalId`, an `input` (the question) and a `groundTruth` with the expected assertions: `rubricId` (L57 rubric), `minScore`, `mustMention` and `mustNotMention`. The dataset metadata records `seedRevision` and `revisionVersions` (revision → dataset version).
- **Runner** (`runner.ts`): `dataset.startExperiment({ version, targetType: 'agent', targetId: 'faq-agent', scorers, maxConcurrency: 2, itemTimeout })`, pinned to the dataset version of the chosen revision (or the latest).
  - **Target:** a Mastra agent `faq-agent` with the `search_sources` tool. Offline it runs on the **mock provider** (the scripted model, provider `mlp-offline`); live it uses `modelId`.
  - **Scorers:** the L57 rubric scorer through a new optional `answerOf` adapter (agent targets hand scorers message lists), and a deterministic **assertions** scorer (minScore via the rubric, mustMention, mustNotMention) whose reason lists every assertion.
- **Evidence and reproducibility:** each run executes the experiment, then re-runs the same version offline and compares the per-item outcomes. The experiment appears in `dataset.listExperiments()` with its dataset version.
- **Report:** a new contract `EvalReportSchema` (`output.evalReport`) holds the dataset (id, versions, revision map), the experiment (id, version, status, target, provider, timings) and the items (input, answer, scores, assertions with details, passed, duration), plus a summary (total, passed, failed, pass rate). A new web component `EvalReport` renders it. It is reusable by L59 and L60.
- **Checks:** `dataset-versioned`, `version-pinned`, `runs-on-mock-provider`, `assertions-evaluated`, `experiment-recorded`, `reproducible`.

## Capabilities

### New Capabilities

- `course-labs/lab-58-evaluation-dataset`

### Modified Capabilities

(none; `createRubricScorer` in L57 gains an optional `answerOf` parameter whose default keeps L57's behaviour)

## Impact

- **Files:** `packages/labs/src/lab-58/`, `packages/labs/src/lab-57/scorer.ts` (additive option), `packages/contracts/src/eval-report.ts`, `apps/web/src/components/workspace/EvalReport.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, registry, COMPATIBILITY row.
- **Modes:** offline (mock provider, free) and live (one agent run per scenario, up to 3 steps; four scenarios at the latest revision).
