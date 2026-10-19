import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { summarizeChecks, type LabDefinition, type QualityDashboard } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { searchTool } from '../lab-56/pipeline.js';
import { ensureDataset } from '../lab-58/dataset.js';
import { createAssertionsScorer, createDatasetRubricScorer, createProvenanceScorer } from '../lab-58/scorers.js';
import { CONFIGS } from '../lab-59/configs.js';
import { percentile } from '../lab-59/metrics.js';
import { buildDashboard, readRuns } from './dashboard.js';
import { lab60Definition } from './definition.js';

export const STORES = { course: 'lab-60-quality', 'empty-demo': 'lab-60-empty' } as const;
export const Lab60InputSchema = z.object({
  action: z.enum(['record-and-show', 'show-only']),
  configId: z.enum(['grounded', 'concise', 'no-tools']),
  store: z.enum(['course', 'empty-demo']),
  window: z.number().int().min(1).max(20),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab60Input = z.infer<typeof Lab60InputSchema>;

export interface Lab60Output {
  action: Lab60Input['action'];
  store: Lab60Input['store'];
  recorded: { experimentId: string; configId: string; items: number; traceIds: (string | null)[] } | null;
  /** Outcomes of the run before the latest, by scenario (to verify the regressions). */
  previousOutcomes: Record<string, boolean> | null;
  rebuildIdentical: boolean;
  dashboard: QualityDashboard;
}

const lock = new KeyedLock();

export const lab60: LabImplementation<Lab60Input, Lab60Output, LabServices> = {
  definition: lab60Definition as LabDefinition,
  inputSchema: Lab60InputSchema,

  async run(ctx, input) {
    const file = ctx.services.memory.file(STORES[input.store]);
    return lock.run(
      file,
      async () => {
        const storage = new LibSQLStore({ id: STORES[input.store], url: `file:${file}` });
        // Traces are stored next to the runs, so trace links still resolve after a restart.
        const observability = new Observability({
          configs: { quality: { serviceName: 'mastra-learning-platform', exporters: [new MastraStorageExporter()] } },
        });
        const cfg = CONFIGS[input.configId];
        const m = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: cfg.offline() });
        const agent = withLabLogger(
          ctx as RunContext<unknown>,
          new Agent({
            id: cfg.agentId,
            name: cfg.label,
            instructions: cfg.instructions,
            model: m.model,
            ...(cfg.tools.length ? { tools: { search_sources: searchTool('none') } } : {}),
          }),
        );
        const mastra = new Mastra({ agents: { [cfg.agentId]: agent }, logger: noopLogger, storage, observability });
        try {
          let recorded: Lab60Output['recorded'] = null;
          if (input.action === 'record-and-show' && input.store === 'course') {
            const seed = await ensureDataset(mastra);
            ctx.emit({ type: 'workflow-step', stepId: `record run (${cfg.id})`, status: 'running' });
            const s = (await seed.dataset.startExperiment({
              version: seed.version,
              targetType: 'agent',
              targetId: cfg.agentId,
              scorers: [createDatasetRubricScorer(), createAssertionsScorer(), createProvenanceScorer()],
              maxConcurrency: 2,
              itemTimeout: 60_000,
              name: `run:${cfg.id}`,
              metadata: { configId: cfg.id, labRunId: ctx.runId, correlationId: ctx.correlationId },
              signal: ctx.signal,
            } as never)) as {
              experimentId: string;
              totalItems: number;
              status: string;
              results: { output?: { traceId?: string | null } }[];
            };
            await observability.flush();
            recorded = {
              experimentId: s.experimentId,
              configId: cfg.id,
              items: s.totalItems,
              traceIds: s.results.map((r) => r.output?.traceId ?? null),
            };
            ctx.emit({
              type: 'workflow-step',
              stepId: `record run (${cfg.id})`,
              status: s.status === 'completed' ? 'success' : 'failed',
              output: { experimentId: s.experimentId },
            });
          } else if (input.action === 'record-and-show') {
            ctx.log('info', 'The empty-demo store is never written: nothing was recorded, so the first-use state is shown.');
          }

          ctx.emit({ type: 'workflow-step', stepId: 'build dashboard from storage', status: 'running' });
          const dashboard = await buildDashboard(mastra, input.window);
          // Built twice from storage: every number must come from the stored runs, not from this process.
          const rebuilt = await buildDashboard(mastra, input.window);
          ctx.emit({
            type: 'workflow-step',
            stepId: 'build dashboard from storage',
            status: 'success',
            output: { runs: dashboard.kpis.runs, latestPassRate: dashboard.kpis.latestPassRate, empty: dashboard.empty.isEmpty },
          });

          // The previous run's outcomes, read again from storage, to verify the regressions independently.
          const stored = (await readRuns(mastra)) ?? [];
          const shown = stored.slice(-input.window);
          const previous = shown.length >= 2 ? shown.at(-2)! : null;
          const previousOutcomes = previous ? Object.fromEntries(previous.items.map((i) => [i.externalId, i.passed])) : null;
          ctx.setResultExtras({
            effective: {
              mode: ctx.mode,
              modelId: input.modelId,
              simulated: m.simulated,
              store: STORES[input.store],
              window: input.window,
            },
          });
          return {
            action: input.action,
            store: input.store,
            recorded,
            previousOutcomes,
            rebuildIdentical: JSON.stringify(dashboard) === JSON.stringify(rebuilt),
            dashboard,
          };
        } finally {
          await observability.shutdown().catch(() => undefined);
        }
      },
      ctx.signal,
    );
  },

  validate(out, input) {
    const d = out.dashboard;
    const latest = d.runs.at(-1);

    const fromStorageOk =
      out.rebuildIdentical &&
      d.runs.every((r) => r.total > 0 && r.passRate === Math.round((r.passed / r.total) * 10_000) / 10_000) &&
      (!out.recorded || (latest?.experimentId === out.recorded.experimentId && latest.total === out.recorded.items)) &&
      d.kpis.latestPassRate === (latest?.passRate ?? null);

    const prev = out.previousOutcomes;
    const expectedRegressions = prev
      ? d.latestItems.filter((i) => !i.passed && prev[i.externalId] === true).map((i) => i.externalId)
      : [];
    const regressionsOk =
      d.runs.length >= 2
        ? !d.regressions.needsTwoRuns &&
          JSON.stringify(d.regressions.items.map((i) => i.externalId)) === JSON.stringify(expectedRegressions) &&
          d.kpis.regressions === expectedRegressions.length &&
          d.kpis.passRateDelta === Math.round((d.runs.at(-1)!.passRate - d.runs.at(-2)!.passRate) * 10_000) / 10_000
        : d.regressions.needsTwoRuns &&
          d.regressions.items.length === 0 &&
          d.kpis.regressions === null &&
          d.kpis.passRateDelta === null;

    const durations = d.latestItems.map((i) => i.durationMs).filter((x): x is number => x !== null);
    const latencyOk =
      d.runs.every(
        (r) =>
          r.latency.p50 !== null &&
          r.latency.p95 !== null &&
          r.latency.p99 !== null &&
          r.latency.p50 <= r.latency.p95 &&
          r.latency.p95 <= r.latency.p99,
      ) &&
      (!latest || latest.latency.p50 === percentile(durations, 0.5));

    const linked = d.latestItems.filter((i) => i.traceId);
    const tracesOk =
      linked.every((i) => {
        const spans = d.traces[i.traceId!];
        return (
          !!spans && spans.length > 0 && spans.every((s) => s.traceId === i.traceId) && spans.some((s) => s.parentId === null)
        );
      }) &&
      (!out.recorded || out.recorded.traceIds.every((t) => !!t)) &&
      d.regressions.items.every((r) => !r.traceId || !!d.traces[r.traceId]);

    const k = d.kpis;
    const allNull = [k.latestPassRate, k.previousPassRate, k.passRateDelta, k.latestP50, k.latestP95, k.regressions].every(
      (v) => v === null,
    );
    const emptyOk = d.empty.isEmpty
      ? d.empty.reason !== null &&
        d.empty.message.length > 0 &&
        d.empty.actions.length > 0 &&
        allNull &&
        d.runs.length === 0 &&
        d.latestItems.length === 0
      : d.empty.reason === null && d.runs.length > 0 && input.store !== 'empty-demo';

    return summarizeChecks([
      {
        id: 'metrics-from-fixtures',
        label: 'Every dashboard number is derived from stored runs of the dataset (rebuilt identically from storage)',
        passed: fromStorageOk,
        message: d.empty.isEmpty
          ? 'no runs stored'
          : `${k.runs} stored run(s); latest pass rate ${k.latestPassRate} over ${latest?.total} scenarios`,
      },
      {
        id: 'regressions-detected',
        label: 'Regressions are the scenarios that passed in the previous run and fail in the latest',
        passed: regressionsOk,
        message: d.regressions.needsTwoRuns
          ? 'needs two runs'
          : `${d.regressions.items.length} regression(s): ${d.regressions.items.map((i) => i.externalId).join(', ') || 'none'}`,
      },
      {
        id: 'latency-percentiles',
        label: 'Each run shows nearest-rank latency p50 ≤ p95 ≤ p99 from its stored item durations',
        passed: latencyOk,
        message:
          d.runs.map((r) => `${r.configId ?? r.name}: ${r.latency.p50}/${r.latency.p95}/${r.latency.p99} ms`).join('; ') ||
          'no runs',
      },
      {
        id: 'trace-links-resolve',
        label: 'Every linked trace is read back from storage with its root span',
        passed: tracesOk,
        message: `${linked.length} linked item(s), ${Object.keys(d.traces).length} trace(s) resolved`,
      },
      {
        id: 'empty-state-usable',
        label: 'Without data the dashboard says why and what to do, with no invented numbers',
        passed: emptyOk,
        message: d.empty.isEmpty ? `${d.empty.reason}: ${d.empty.message}` : 'data present',
      },
    ]);
  },
};
