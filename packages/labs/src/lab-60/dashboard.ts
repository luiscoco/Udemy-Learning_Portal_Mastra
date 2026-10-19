import type { Mastra } from '@mastra/core';
import type { QualityDashboard, TraceSpan } from '@mlp/contracts';
import { itemsOf } from '../lab-58/dataset.js';
import { DATASET_ID } from '../lab-58/scenarios.js';
import { percentile } from '../lab-59/metrics.js';

/** One stored run, as read from the experiments, results and scores domains. */
export interface StoredRun {
  experimentId: string;
  name: string;
  configId: string | null;
  datasetVersion: number | null;
  startedAt: string;
  items: {
    itemId: string;
    externalId: string;
    title: string;
    passed: boolean;
    failedAssertions: string[];
    durationMs: number | null;
    traceId: string | null;
    error: string | null;
  }[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const MAX_SPANS = 40;

export const EMPTY_ACTIONS = {
  'no-dataset': ['Choose “Record a run, then show the dashboard” on the course store to create the dataset and the first run.'],
  'no-runs': [
    'Choose “Record a run, then show the dashboard” to add the first run.',
    'Record a second run with another configuration to see regressions.',
  ],
};

/** The failed assertions listed in a scenario-assertions reason (entries starting with ✗). */
export const failedFromReason = (reason: string | null | undefined) =>
  (reason ?? '')
    .split('; ')
    .filter((s) => s.startsWith('✗'))
    .map((s) => s.replace(/^✗\s*/, '').slice(0, 300));

/**
 * Pure: turns stored runs (oldest first) into the dashboard. No value is invented: with no runs every KPI is
 * null, with one run the regressions report that two runs are needed.
 */
export function assembleDashboard(
  runsAll: StoredRun[],
  window: number,
  datasetFound: boolean,
  traces: QualityDashboard['traces'],
): QualityDashboard {
  const runs = runsAll.slice(-window);
  const rows = runs.map((r) => {
    const durations = r.items.map((i) => i.durationMs).filter((d): d is number => d !== null);
    const passed = r.items.filter((i) => i.passed).length;
    return {
      experimentId: r.experimentId,
      name: r.name,
      configId: r.configId,
      datasetVersion: r.datasetVersion,
      startedAt: r.startedAt,
      total: r.items.length,
      passed,
      passRate: r.items.length ? r4(passed / r.items.length) : 0,
      errored: r.items.filter((i) => i.error).length,
      latency: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), p99: percentile(durations, 0.99) },
    };
  });
  const latest = runs.at(-1);
  const previous = runs.length >= 2 ? runs.at(-2)! : null;
  const latestRow = rows.at(-1);
  const prevRow = rows.length >= 2 ? rows.at(-2)! : null;
  const regressions =
    previous && latest
      ? latest.items
          .filter((i) => !i.passed && previous.items.find((p) => p.externalId === i.externalId)?.passed)
          .map((i) => ({
            externalId: i.externalId,
            title: i.title,
            failedAssertions: i.failedAssertions,
            traceId: i.traceId,
            previousExperimentId: previous.experimentId,
            latestExperimentId: latest.experimentId,
          }))
      : [];
  const reason = !datasetFound ? 'no-dataset' : runs.length === 0 ? 'no-runs' : null;
  const notes: string[] = [];
  if (previous && latest && previous.datasetVersion !== latest.datasetVersion)
    notes.push(
      `The last two runs used different dataset versions (${previous.datasetVersion} and ${latest.datasetVersion}); regressions compare their common scenarios only.`,
    );
  if (runsAll.length > runs.length) notes.push(`Showing the last ${runs.length} of ${runsAll.length} runs.`);
  return {
    datasetId: DATASET_ID,
    datasetVersion: latest?.datasetVersion ?? null,
    window,
    empty: {
      isEmpty: reason !== null,
      reason,
      message:
        reason === 'no-dataset'
          ? 'There is no evaluation dataset in this store yet, so there is nothing to measure.'
          : reason === 'no-runs'
            ? 'The dataset exists, but no evaluation run has been recorded yet.'
            : '',
      actions: reason ? EMPTY_ACTIONS[reason] : [],
    },
    kpis: {
      runs: runsAll.length,
      latestPassRate: latestRow?.passRate ?? null,
      previousPassRate: prevRow?.passRate ?? null,
      passRateDelta: latestRow && prevRow ? r4(latestRow.passRate - prevRow.passRate) : null,
      latestP50: latestRow?.latency.p50 ?? null,
      latestP95: latestRow?.latency.p95 ?? null,
      regressions: previous ? regressions.length : null,
    },
    runs: rows,
    regressions: { needsTwoRuns: !previous, items: regressions },
    latestItems: (latest?.items ?? []).map(({ externalId, title, passed, failedAssertions, durationMs, traceId, error }) => ({
      externalId,
      title,
      passed,
      failedAssertions,
      durationMs,
      traceId,
      error,
    })),
    traces,
    notes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ms = (d: unknown) => (d ? new Date(d as string).getTime() : NaN);

/** A stored span (observability storage shape) mapped to the L56 TraceSpan contract; errors as messages only. */
export function storedSpansToTrace(spans: Any[]): TraceSpan[] {
  const t0 = Math.min(...spans.map((s) => ms(s.startedAt)).filter(Number.isFinite));
  return [...spans]
    .sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
    .slice(0, MAX_SPANS)
    .map((s) => {
      const start = ms(s.startedAt);
      const end = ms(s.endedAt);
      const message =
        typeof s.error?.message === 'string' ? s.error.message.split('\n')[0]!.slice(0, 300) : s.error ? 'error' : null;
      return {
        id: String(s.spanId),
        parentId: s.parentSpanId ? String(s.parentSpanId) : null,
        traceId: String(s.traceId),
        name: String(s.name ?? '').slice(0, 200),
        type: String(s.spanType ?? 'unknown'),
        entity: s.entityId ? String(s.entityId).slice(0, 120) : null,
        startMs: Number.isFinite(start) ? Math.max(0, Math.round(start - t0)) : 0,
        durationMs: Number.isFinite(end) && Number.isFinite(start) ? Math.max(0, Math.round(end - start)) : null,
        status: message ? 'error' : Number.isFinite(end) ? 'ok' : 'open',
        error: message,
        attributes: {},
        correlationId: typeof s.metadata?.correlationId === 'string' ? s.metadata.correlationId.slice(0, 120) : null,
      };
    });
}

const isNotFound = (e: unknown) => /not found/i.test(e instanceof Error ? e.message : String(e));

/** Every completed run of the dataset, oldest first, read from the experiments, results and scores domains. null = no dataset. */
export async function readRuns(mastra: Mastra): Promise<StoredRun[] | null> {
  let dataset;
  try {
    dataset = await mastra.datasets.get({ id: DATASET_ID });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    return null;
  }
  const scoresStore: Any = await mastra.getStorage()!.getStore('scores');
  const titles = new Map(
    (await itemsOf(dataset)).map((i) => [
      i.id,
      {
        externalId: i.externalId ?? i.id,
        title: String((i.metadata as { title?: string } | null)?.title ?? i.externalId ?? i.id),
      },
    ]),
  );
  const listed = (await dataset.listExperiments({ perPage: 100 } as never)) as { experiments: Any[] };
  const experiments = listed.experiments
    .filter((e) => e.status === 'completed')
    .sort((a, b) => ms(a.startedAt) - ms(b.startedAt) || String(a.id).localeCompare(String(b.id)));
  const runs: StoredRun[] = [];
  for (const e of experiments) {
    const results = ((await dataset.listExperimentResults({ experimentId: e.id, perPage: 500 } as never)) as { results: Any[] })
      .results;
    const scores = (
      (await scoresStore.listScoresByRunId({ runId: e.id, pagination: { page: 0, perPage: 500 } })) as { scores: Any[] }
    ).scores.filter((s) => s.scorerId === 'scenario-assertions');
    const byItem = new Map(scores.map((s) => [s.entityId, s]));
    runs.push({
      experimentId: e.id,
      name: String(e.name ?? ''),
      configId: typeof e.metadata?.configId === 'string' ? e.metadata.configId : null,
      datasetVersion: typeof e.datasetVersion === 'number' ? e.datasetVersion : null,
      startedAt: new Date(e.startedAt ?? e.createdAt).toISOString(),
      items: results
        .map((r) => {
          const s = byItem.get(r.itemId);
          const t = titles.get(r.itemId);
          return {
            itemId: r.itemId,
            externalId: t?.externalId ?? r.itemId,
            title: t?.title ?? r.itemId,
            passed: !r.error && s?.score === 1,
            failedAssertions: failedFromReason(s?.reason),
            durationMs: r.startedAt && r.completedAt ? Math.max(0, ms(r.completedAt) - ms(r.startedAt)) : null,
            traceId: typeof r.traceId === 'string' && r.traceId ? r.traceId : null,
            error: r.error ? String(r.error.message ?? r.error).slice(0, 300) : null,
          };
        })
        .sort((a, b) => a.externalId.localeCompare(b.externalId)),
    });
  }
  return runs;
}

/** Reads the stored runs and their traces and assembles the dashboard. */
export async function buildDashboard(mastra: Mastra, window: number): Promise<QualityDashboard> {
  const runs = await readRuns(mastra);
  if (!runs) return assembleDashboard([], window, false, {});
  const obsStore: Any = await mastra.getStorage()!.getStore('observability');
  // Trace links: the latest run's items (regressions are among them). Each trace is read back from storage.
  const shown = runs.slice(-window);
  const want = new Set<string>();
  for (const i of shown.at(-1)?.items ?? []) if (i.traceId) want.add(i.traceId);
  const traces: QualityDashboard['traces'] = {};
  for (const traceId of want) {
    const t = await obsStore.getTrace({ traceId }).catch(() => null);
    if (t?.spans?.length) traces[traceId] = storedSpansToTrace(t.spans);
  }
  return assembleDashboard(runs, window, true, traces);
}
