import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { Dataset } from '@mastra/core/datasets';
import { noopLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { summarizeChecks, type ComparisonConfig, type ExperimentComparison, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import { OFFLINE_PROVIDER, type LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { searchTool } from '../lab-56/pipeline.js';
import { ensureDataset, itemsOf } from '../lab-58/dataset.js';
import { DATASET_ID } from '../lab-58/scenarios.js';
import { createAssertionsScorer, createDatasetRubricScorer, createProvenanceScorer, PROVENANCE_ID } from '../lab-58/scorers.js';
import { CONFIGS, CONFIG_IDS, type ConfigId } from './configs.js';
import { lab59Definition } from './definition.js';
import {
  deltasOf,
  deterministicView,
  itemMatrix,
  METRIC_DEFINITIONS,
  metricsOf,
  NO_COST_NOTE,
  parseCsvLine,
  toCsv,
  type ItemMeasure,
} from './metrics.js';

export const STORE = 'lab-59-experiments';

/** The configurations a run compares: grounded and the baseline always, the others when chosen. */
export function selectedConfigs(i: {
  baseline: string;
  includeConcise: boolean;
  includeNoTools: boolean;
  altModelId: string;
}): ConfigId[] {
  return CONFIG_IDS.filter(
    (id) =>
      id === 'grounded' ||
      id === i.baseline ||
      (id === 'concise' && i.includeConcise) ||
      (id === 'no-tools' && i.includeNoTools) ||
      (id === 'alt-model' && i.altModelId !== 'none'),
  );
}
const BASELINES = ['grounded', 'concise', 'no-tools'] as const;
export const Lab59InputSchema = z
  .object({
    baseline: z.enum(BASELINES),
    includeConcise: z.boolean(),
    includeNoTools: z.boolean(),
    altModelId: z.enum(['none', ...DEFAULT_LIVE_MODELS]),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  // Mastra's compareExperiments needs at least two experiments, and a comparison needs two configurations.
  .refine((i) => selectedConfigs(i).length >= 2, {
    message: 'Select at least one configuration besides the baseline.',
    path: ['includeConcise'],
  });
export type Lab59Input = z.infer<typeof Lab59InputSchema>;

export interface Lab59Output {
  selected: ConfigId[];
  experiments: { configId: ConfigId; experimentId: string; status: string; datasetVersion: number; totalItems: number }[];
  reproducibility: { storageRebuildIdentical: boolean; replayIdentical: boolean; replayRuns: number };
  comparison: ExperimentComparison;
}

const lock = new KeyedLock();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;
type Titles = Map<string, { externalId: string; title: string }>;

const scoreOf = (scores: Record<string, number | null> | undefined, id: string) =>
  scores && typeof scores[id] === 'number' ? scores[id]! : null;
const durationOf = (r: Result) =>
  r.startedAt && r.completedAt ? Math.max(0, new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) : null;

/** Item measures from an in-memory experiment summary (used for the replays). */
function measuresFromSummary(results: Result[], titles: Titles): ItemMeasure[] {
  return results
    .map((r) => {
      const scores = Object.fromEntries(
        (r.scores ?? []).map((s: { scorerId: string; score: number | null }) => [s.scorerId, s.score]),
      );
      return {
        itemId: r.itemId,
        externalId: titles.get(r.itemId)?.externalId ?? r.itemId,
        title: titles.get(r.itemId)?.title ?? '',
        passed: !r.error && scoreOf(scores, 'scenario-assertions') === 1,
        rubricScore: scoreOf(scores, 'scenario-rubric'),
        usage: r.output?.usage ?? null,
        durationMs: durationOf(r),
      };
    })
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
}

/** Item measures from storage: compareExperiments for the scores, listExperimentResults for timings and usage. */
async function measuresFromStorage(
  mastra: Mastra,
  dataset: Dataset,
  experimentIds: string[],
  baselineId: string,
  titles: Titles,
) {
  const cmp = await mastra.datasets.compareExperiments({ experimentIds, baselineId });
  const out: Record<string, ItemMeasure[]> = {};
  for (const id of experimentIds) {
    const listed = (await dataset.listExperimentResults({ experimentId: id, perPage: 500 } as never)) as { results: Result[] };
    const byItem = new Map(listed.results.map((r) => [r.itemId, r]));
    out[id] = cmp.items
      .filter((i) => i.results[id])
      .map((i) => {
        const r = byItem.get(i.itemId);
        const scores = i.results[id]!.scores;
        return {
          itemId: i.itemId,
          externalId: titles.get(i.itemId)?.externalId ?? i.itemId,
          title: titles.get(i.itemId)?.title ?? '',
          passed: !r?.error && scoreOf(scores, 'scenario-assertions') === 1,
          rubricScore: scoreOf(scores, 'scenario-rubric'),
          usage: r?.output?.usage ?? (i.results[id]!.output as { usage?: ItemMeasure['usage'] } | null)?.usage ?? null,
          durationMs: r ? durationOf(r) : null,
        };
      })
      .sort((a, b) => a.externalId.localeCompare(b.externalId));
  }
  return out;
}

interface ConfigRun {
  id: ConfigId;
  experimentId: string;
  modelId: string;
  provider: string;
  simulated: boolean;
}

function buildComparison(
  runs: ConfigRun[],
  measures: Record<ConfigId, ItemMeasure[]>,
  baseline: ConfigId,
  datasetVersion: number,
): Omit<ExperimentComparison, 'export'> {
  const base = measures[baseline]!;
  const baseMetrics = metricsOf(base, runs.find((r) => r.id === baseline)!.simulated);
  const configs: ComparisonConfig[] = runs.map((r) => {
    const metrics = metricsOf(measures[r.id]!, r.simulated);
    return {
      id: r.id,
      label: CONFIGS[r.id].label,
      experimentId: r.experimentId,
      modelId: r.modelId,
      provider: r.provider,
      simulated: r.simulated,
      tools: CONFIGS[r.id].tools,
      metrics,
      deltas: r.id === baseline ? null : deltasOf(measures[r.id]!, metrics, base, baseMetrics),
    };
  });
  const notes = [
    'Latency is measured per scenario (completedAt − startedAt) and varies between runs; it is excluded from the reproducibility checks.',
    configs.some((c) => c.simulated)
      ? 'Token counts from the mock provider are simulated (counted by the scripted model), not real model usage.'
      : '',
    configs.every((c) => c.metrics.cost.value === null) ? `Cost: ${NO_COST_NOTE}` : '',
    runs.some((r) => r.id === 'alt-model' && r.simulated)
      ? 'Offline, the alt-model configuration runs the same scripted model as grounded.'
      : '',
  ].filter(Boolean);
  return {
    datasetId: DATASET_ID,
    datasetVersion,
    baselineConfigId: baseline,
    configs,
    items: itemMatrix(measures, baseline),
    notes,
  };
}

export const lab59: LabImplementation<Lab59Input, Lab59Output, LabServices> = {
  definition: lab59Definition as LabDefinition,
  inputSchema: Lab59InputSchema,

  async run(ctx, input) {
    const selected = selectedConfigs(input);
    const file = ctx.services.memory.file(STORE);
    return lock.run(
      file,
      async () => {
        const storage = new LibSQLStore({ id: STORE, url: `file:${file}` });
        const modelFor = (id: ConfigId, offline: boolean) => {
          const cfg = CONFIGS[id];
          const modelId = cfg.model === 'alt' && input.altModelId !== 'none' ? input.altModelId : input.modelId;
          const m = ctx.services.models.resolve({ mode: offline ? 'offline' : ctx.mode, modelId, offline: cfg.offline() });
          // Offline the requested model id only names the scripted stand-in; say so instead of implying the real model ran.
          return { model: m.model, simulated: m.simulated, modelId: m.simulated ? `scripted stand-in for ${modelId}` : modelId };
        };
        const agentsFor = (offline: boolean) =>
          Object.fromEntries(
            selected.map((id) => {
              const cfg = CONFIGS[id];
              const m = modelFor(id, offline);
              return [
                cfg.agentId,
                withLabLogger(
                  ctx as RunContext<unknown>,
                  new Agent({
                    id: cfg.agentId,
                    name: cfg.label,
                    instructions: cfg.instructions,
                    model: m.model,
                    ...(cfg.tools.length ? { tools: { search_sources: searchTool('none') } } : {}),
                  }),
                ),
              ];
            }),
          );
        const mastra = new Mastra({ agents: agentsFor(false), logger: noopLogger, storage });
        const seed = await ensureDataset(mastra);
        const version = seed.version;
        const titles: Titles = new Map(
          (await itemsOf(seed.dataset, version)).map((i) => [
            i.id,
            {
              externalId: i.externalId ?? i.id,
              title: String((i.metadata as { title?: string } | null)?.title ?? i.externalId ?? ''),
            },
          ]),
        );
        const scorers = [createDatasetRubricScorer(), createAssertionsScorer(), createProvenanceScorer()];

        const runs: ConfigRun[] = [];
        const experiments: Lab59Output['experiments'] = [];
        for (const id of selected) {
          ctx.throwIfAborted();
          const m = modelFor(id, false);
          ctx.emit({ type: 'workflow-step', stepId: `experiment ${id}`, status: 'running' });
          const s = (await seed.dataset.startExperiment({
            version,
            targetType: 'agent',
            targetId: CONFIGS[id].agentId,
            scorers,
            maxConcurrency: 2,
            itemTimeout: 60_000,
            name: `config:${id}`,
            metadata: { configId: id, labRunId: ctx.runId, modelId: m.modelId },
            signal: ctx.signal,
          } as never)) as Result;
          const providers = [
            ...new Set(
              s.results.map((r: Result) =>
                String((r.scores ?? []).find((x: { scorerId: string }) => x.scorerId === PROVENANCE_ID)?.reason ?? 'unknown'),
              ),
            ),
          ].join(', ');
          runs.push({ id, experimentId: s.experimentId, modelId: m.modelId, provider: providers, simulated: m.simulated });
          experiments.push({
            configId: id,
            experimentId: s.experimentId,
            status: s.status,
            datasetVersion: version,
            totalItems: s.totalItems,
          });
          ctx.emit({
            type: 'workflow-step',
            stepId: `experiment ${id}`,
            status: s.status === 'completed' ? 'success' : 'failed',
            output: { experimentId: s.experimentId, items: s.totalItems },
          });
        }
        const baseline = input.baseline;
        const ids = runs.map((r) => r.experimentId);
        const baseExp = runs.find((r) => r.id === baseline)!.experimentId;
        const toCfg = (m: Record<string, ItemMeasure[]>) =>
          Object.fromEntries(runs.map((r) => [r.id, m[r.experimentId]!])) as Record<ConfigId, ItemMeasure[]>;

        ctx.emit({ type: 'workflow-step', stepId: 'compare from storage', status: 'running' });
        const comparison = buildComparison(
          runs,
          toCfg(await measuresFromStorage(mastra, seed.dataset, ids, baseExp, titles)),
          baseline,
          version,
        );
        const rebuilt = buildComparison(
          runs,
          toCfg(await measuresFromStorage(mastra, seed.dataset, ids, baseExp, titles)),
          baseline,
          version,
        );
        const storageRebuildIdentical = JSON.stringify(comparison) === JSON.stringify(rebuilt);
        ctx.emit({
          type: 'workflow-step',
          stepId: 'compare from storage',
          status: 'success',
          output: { identical: storageRebuildIdentical },
        });

        // Replay every configuration on the mock provider (results not persisted).
        ctx.emit({ type: 'workflow-step', stepId: 'mock-provider replay', status: 'running' });
        const offlineMastra = new Mastra({ agents: agentsFor(true), logger: noopLogger, storage });
        const offlineDataset = await offlineMastra.datasets.get({ id: DATASET_ID });
        const replay = async () => {
          const measures: Record<string, ItemMeasure[]> = {};
          for (const id of selected) {
            const s = (await offlineDataset.startExperiment({
              version,
              targetType: 'agent',
              targetId: CONFIGS[id].agentId,
              scorers,
              maxConcurrency: 2,
              name: `replay:${id}`,
              persistence: { experiments: 'none', scores: 'none' },
            } as never)) as Result;
            measures[id] = measuresFromSummary(s.results, titles);
          }
          const offlineRuns = runs.map((r) => ({ ...r, simulated: true, provider: OFFLINE_PROVIDER }));
          return buildComparison(offlineRuns, measures as Record<ConfigId, ItemMeasure[]>, baseline, version);
        };
        const viewOf = (x: Omit<ExperimentComparison, 'export'>) => deterministicView(x.configs, x.items);
        // Offline the main run is already on the mock provider; live, the mock provider is replayed twice.
        const views =
          ctx.mode === 'offline'
            ? [viewOf(comparison), viewOf(await replay())]
            : [viewOf(await replay()), viewOf(await replay())];
        const replayIdentical = new Set(views).size === 1;
        ctx.emit({
          type: 'workflow-step',
          stepId: 'mock-provider replay',
          status: 'success',
          output: { identical: replayIdentical },
        });

        const generatedAt = new Date().toISOString();
        const json = JSON.stringify(
          {
            schema: 'mlp.experiment-comparison/1',
            dataset: { id: DATASET_ID, version, revisionVersions: seed.meta.revisionVersions },
            baseline,
            configs: comparison.configs,
            items: comparison.items,
            notes: comparison.notes,
            metricDefinitions: METRIC_DEFINITIONS,
            generatedAt,
          },
          null,
          2,
        );
        ctx.setResultExtras({
          effective: {
            mode: ctx.mode,
            modelId: input.modelId,
            simulated: runs.every((r) => r.simulated),
            altModelId: input.altModelId,
            datasetVersion: version,
          },
        });
        return {
          selected,
          experiments,
          reproducibility: { storageRebuildIdentical, replayIdentical, replayRuns: ctx.mode === 'offline' ? 1 : 2 },
          comparison: {
            ...comparison,
            export: { json, csv: toCsv(comparison.configs), filename: `experiment-comparison-v${version}` },
          },
        };
      },
      ctx.signal,
    );
  },

  validate(out, input, vctx) {
    const c = out.comparison;
    const mode = vctx?.mode ?? 'offline';
    const versions = new Set(out.experiments.map((e) => e.datasetVersion));
    const ranOk =
      out.experiments.length === out.selected.length &&
      out.experiments.every((e) => e.status === 'completed' && e.totalItems === c.items.length) &&
      versions.size === 1 &&
      c.datasetVersion === out.experiments[0]?.datasetVersion &&
      out.selected.includes(input.baseline) &&
      c.configs.length === out.selected.length;

    const measuredOk = c.configs.every(
      (x) =>
        x.metrics.total === c.items.length &&
        x.metrics.tokens.total !== null &&
        x.metrics.tokens.source === (x.simulated ? 'simulated' : 'provider') &&
        x.metrics.latencyMs.p50 !== null &&
        x.metrics.latencyMs.p95 !== null &&
        x.provider !== 'unknown' &&
        (mode === 'offline' ? x.provider === OFFLINE_PROVIDER : x.provider !== OFFLINE_PROVIDER),
    );

    const costOk = c.configs.every((x) =>
      x.metrics.cost.value === null
        ? x.metrics.cost.source === null && x.metrics.cost.note.length > 0
        : x.metrics.cost.source === 'provider' && !x.simulated,
    );

    const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
    const base = c.configs.find((x) => x.id === c.baselineConfigId);
    const deltasOk =
      !!base &&
      base.deltas === null &&
      c.configs
        .filter((x) => x.id !== c.baselineConfigId)
        .every(
          (x) =>
            !!x.deltas &&
            x.deltas.passRate === r4(x.metrics.passRate - base.metrics.passRate) &&
            x.deltas.meanScore ===
              (x.metrics.meanScore === null || base.metrics.meanScore === null
                ? null
                : r4(x.metrics.meanScore - base.metrics.meanScore)) &&
            x.deltas.regressions === c.items.filter((i) => i.changes[x.id] === 'regression').length &&
            x.deltas.improvements === c.items.filter((i) => i.changes[x.id] === 'improvement').length,
        );

    let exportOk = false;
    let exportMsg: string;
    try {
      const doc = JSON.parse(c.export.json) as { schema: string; configs: ComparisonConfig[]; dataset: { version: number } };
      const lines = c.export.csv.trim().split(/\r\n/);
      const header = parseCsvLine(lines[0]!);
      const passIdx = header.indexOf('pass_rate');
      exportOk =
        doc.schema === 'mlp.experiment-comparison/1' &&
        doc.dataset.version === c.datasetVersion &&
        JSON.stringify(doc.configs) === JSON.stringify(c.configs) &&
        lines.length === c.configs.length + 1 &&
        lines.slice(1).every((l, i) => {
          const cells = parseCsvLine(l);
          return (
            cells.length === header.length &&
            cells[0] === c.configs[i]!.id &&
            Number(cells[passIdx]) === c.configs[i]!.metrics.passRate
          );
        });
      exportMsg = `JSON ${c.export.json.length} chars, CSV ${lines.length - 1} row(s)`;
    } catch (e) {
      exportMsg = `export does not parse: ${(e as Error).message}`;
    }

    return summarizeChecks([
      {
        id: 'configs-ran',
        label: 'Every selected configuration ran as an experiment on the same dataset version',
        passed: ranOk,
        message: `${out.experiments.map((e) => `${e.configId}: ${e.status}`).join(', ')} on version ${[...versions].join(', ')}`,
      },
      {
        id: 'metrics-measured',
        label: 'Each configuration has a pass rate, mean score, token counts (with their source) and latency percentiles',
        passed: measuredOk,
        message: c.configs
          .map(
            (x) =>
              `${x.id}: pass ${x.metrics.passRate}, score ${x.metrics.meanScore}, tokens ${x.metrics.tokens.total} (${x.metrics.tokens.source}), p50 ${x.metrics.latencyMs.p50} ms`,
          )
          .join('; '),
      },
      {
        id: 'no-fabricated-cost',
        label: 'Cost is shown only when the provider reported it; otherwise it is empty with the reason',
        passed: costOk,
        message: c.configs.map((x) => `${x.id}: ${x.metrics.cost.value ?? 'not reported'}`).join(', '),
      },
      {
        id: 'deltas-consistent',
        label: 'Deltas equal each configuration’s metrics minus the baseline’s, and regressions match the per-scenario changes',
        passed: deltasOk,
        message: c.configs
          .filter((x) => x.deltas)
          .map(
            (x) => `${x.id}: Δpass ${x.deltas!.passRate}, Δscore ${x.deltas!.meanScore}, ${x.deltas!.regressions} regression(s)`,
          )
          .join('; '),
      },
      {
        id: 'reproducible',
        label:
          'The comparison rebuilt from storage is identical, and a mock-provider replay gives the same deterministic metrics',
        passed: out.reproducibility.storageRebuildIdentical && out.reproducibility.replayIdentical,
        message: `storage rebuild ${out.reproducibility.storageRebuildIdentical ? 'identical' : 'differs'}; replay ${out.reproducibility.replayIdentical ? 'identical' : 'differs'} (latency excluded)`,
      },
      {
        id: 'exportable',
        label: 'The comparison exports as JSON and CSV that parse back to the same values',
        passed: exportOk,
        message: exportMsg,
      },
    ]);
  },
};
