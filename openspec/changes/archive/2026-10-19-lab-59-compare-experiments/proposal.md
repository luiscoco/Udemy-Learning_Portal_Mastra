# Proposal

## Why

One experiment says how good a configuration is. A decision ("ship the concise prompt?", "drop the search tool?", "switch model?") needs several configurations run on the same dataset version and compared on quality, tokens, latency and cost. The comparison must be honest: it shows only measurements that exist (no invented costs), states where each number comes from, can be reproduced, and can be exported for a review.

The DoD asks to run multiple configurations and compare score, token count where available, latency, and cost if the provider supplies it, with no fabricated costs and comparisons that are reproducible and exportable.

## What Changes

- **New lab `lab-59`** (Module 12), on Mastra's native datasets and experiments. It uses the L58 `course-faq` dataset, seeded with the same revisions into this lab's own LibSQL file (`lab-59-experiments`) and run at its latest version.
- **Configurations** (agents registered on the Mastra instance):
  - `grounded`: the L58 FAQ agent with `search_sources`, answering from two sources;
  - `concise`: one-sentence answers from one source;
  - `no-tools`: no search tool;
  - optional `alt-model`: `grounded` on a second live model.

  Each configuration is run as its own experiment, named and tagged with its `configId` in the metadata, with the L58 scorers (rubric, assertions, provenance).
- **Comparison:**
  - `mastra.datasets.compareExperiments({ experimentIds, baselineId })` gives per-item scores per experiment;
  - `listExperimentResults` gives per-item timings and usage;
  - app-level aggregates per configuration: pass rate, mean rubric score (scorable items only), tokens (input, output, total, from `usage`), latency p50 / p95 / mean (from the item start and end times), and cost;
  - deltas against the baseline, and per-item regressions and improvements.
- **Honest units:**
  - tokens are labelled `simulated` on the mock provider and `provider` live;
  - **cost is only shown when the provider's usage carries a cost field**, otherwise it is `null` with the reason. The experiment results contain no cost field, and Mastra's `estimatedCost` comes from a price table in `@mastra/observability`, not from the provider, so it is not presented as cost.
- **Reproducible:** the comparison is recomputed a second time from storage, and the result must be identical. The configurations are also replayed offline on the mock provider, where every deterministic metric must match. Latency is excluded from this match, which the lab states.
- **Exportable:** `export.json` (a self-describing document: dataset version, experiment ids, configurations, metric definitions and units, cost source) and `export.csv` (one row per configuration). The web component offers both as downloads (Blob URLs, no network).
- **Contract:** a new `ExperimentComparisonSchema` (`output.comparison`) and a web component `ExperimentComparison`. Both are reusable by L60.
- **Checks:** `configs-ran`, `metrics-measured`, `no-fabricated-cost`, `deltas-consistent`, `reproducible`, `exportable`.

## Capabilities

### New Capabilities

- `course-labs/lab-59-compare-experiments`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-59/` (reuses the L58 seed, scorers and agent script), `packages/contracts/src/experiment-comparison.ts`, `apps/web/src/components/workspace/ExperimentComparison.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, registry, COMPATIBILITY row.
- **Modes:** offline (mock provider, free) and live (four scenarios × the selected configurations; each agent run up to 3 steps).
