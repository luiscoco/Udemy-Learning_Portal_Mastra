# Design

## Context

Verified in spikes with `@mastra/core` 1.78.0 (see also the L58 rows):

- `mastra.datasets.compareExperiments({ experimentIds, baselineId })` returns `{ baselineId, items: [{ itemId, input, groundTruth, results: { [experimentId]: { output, scores: { [scorerId]: number | null } } | null } }] }`. It reads stored results and computes **no aggregates**.
- `dataset.listExperimentResults({ experimentId })` returns `{ results: [{ itemId, itemDatasetVersion, input, output, groundTruth, error, startedAt, completedAt, retryCount, … }] }`, and `getExperiment({ experimentId })` returns its `name`, `metadata`, `targetId`, `datasetVersion` and `status`.
- The result `output` keys are `text`, `object`, `toolCalls`, `toolResults`, `sources`, `files`, `usage` (`inputTokens`, `outputTokens`, `totalTokens`, `raw`), `reasoningText`, `traceId` and `error`. **There is no cost and no `providerMetadata`.**
- **Cost.** Mastra's `CostContext.estimatedCost` (metrics and model spans) is computed in `@mastra/observability` as tokens × a price from its pricing table. It is an estimate, not a provider-supplied cost.

## Decisions

- **Store and dataset.** A Mastra instance with `LibSQLStore` on `ctx.services.memory.file('lab-59-experiments')`, and the L58 `ensureDataset` (same seed), serialised with a `KeyedLock` per file. The comparison runs at the latest dataset version.
- **Configurations** (`configs.ts`):
  - `{ id, label, agentId, instructions, tools, sources, model: 'main' | 'alt' }`;
  - agents registered as `cfg-grounded`, `cfg-concise`, `cfg-no-tools` and `cfg-alt-model`;
  - offline scripts: `grounded` uses the L58 FAQ script (two sources); `concise` uses the first source only, one sentence; `no-tools` answers "Mastra is a TypeScript framework for building AI agents and workflows." (and the refusal for off-topic questions);
  - `alt-model` exists only when an `altModelId` is chosen. Offline it runs the same script as grounded, and the lab says so.
- **Experiments:** run sequentially, one per configuration: `startExperiment({ version, targetType: 'agent', targetId: agentId, scorers: L58 scorers, maxConcurrency: 2, name: 'config:<id>', metadata: { configId, labRunId, modelId } })`.
- **Metrics** (`metrics.ts`), per configuration:
  - `passRate` = items whose `scenario-assertions` score is 1 / items;
  - `meanScore` = mean `scenario-rubric` score over scorable items (`null` if none);
  - `tokens` = sums of `usage.inputTokens`, `outputTokens` and `totalTokens` (`null` when an item has no usage), with `source: 'simulated' | 'provider'`;
  - `latencyMs` = p50 / p95 (nearest-rank) / mean of `completedAt − startedAt`;
  - `cost` = `{ value: number | null, unit: string | null, source: 'provider' | null, note }`. It is set only from a numeric `usage.cost` or `usage.raw.cost` that a provider supplied, summed over items; otherwise `null` with the note "not reported by the provider (experiment results carry no cost; Mastra's estimatedCost is a price-table estimate and is not shown as cost)".
- **Deltas:** for each non-baseline configuration, `metric − baseline metric` (4 decimals; `null` when either side is null). Per item: `regression` (passed in the baseline, fails here), `improvement` (the reverse) or `same`.
- **Reproducibility:**
  - (1) build the comparison twice from storage (`compareExperiments` + `listExperimentResults`) and compare the deterministic JSON;
  - (2) replay every configuration on the mock provider (once more offline, twice when live), compare `passRate`, `meanScore`, `tokens` and per-item outcomes, and exclude latency (the lab states this).
- **Export:** `export.json` = `JSON.stringify({ schema: 'mlp.experiment-comparison/1', dataset, baseline, configs, items, metricDefinitions, generatedAt })`; `export.csv` = header `config,label,experiment_id,model,provider,pass_rate,mean_score,tokens_total,token_source,latency_p50_ms,latency_p95_ms,cost,cost_source` plus one row per configuration (RFC 4180 quoting).
- **Minimum of two configurations:** `compareExperiments` throws "requires at least 2 distinct experiment IDs", so the input schema refuses a selection with only one configuration ("Select at least one configuration besides the baseline.").
- **Honest model label offline:** the model column reads "scripted stand-in for <model id>" when the mock provider answered.
- **Live findings:**
  - gpt-5-mini: grounded 1.0 pass rate, concise 0.75, no-tools 0.5, with real token counts and p50 latency 3–6 s.
  - claude-haiku-4-5 as the alternative: 1.0 pass rate with p50 2.0 s.
  - **Neither OpenAI nor Anthropic reported a cost**, so cost stayed "not reported".
  - The grounded mean score varied between live runs (0.9 vs 0.74), which is why reproducibility is checked with storage rebuilds and mock-provider replays.
- **Contract** `ExperimentComparisonSchema`: `{ datasetId, datasetVersion, baselineConfigId, configs[{ id, label, experimentId, modelId, provider, simulated, tools, metrics, deltas }], items[{ externalId, title, results: { [configId]: { passed, score } }, changes: { [configId]: 'regression' | 'improvement' | 'same' } }], notes[], export: { json, csv, filename } }`.
