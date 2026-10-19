import type { ComparisonConfig, ComparisonMetrics, ExperimentComparison } from '@mlp/contracts';

/** One item of one configuration's experiment, as measured from storage. */
export interface ItemMeasure {
  itemId: string;
  externalId: string;
  title: string;
  passed: boolean;
  /** scenario-rubric score; null when the scenario is not scorable by a rubric. */
  rubricScore: number | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cost?: unknown; raw?: { cost?: unknown } } | null;
  durationMs: number | null;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Nearest-rank percentile (q in 0..1) of a non-empty list. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

/** A cost the provider reported in usage (e.g. usage.cost); never a price-table estimate. */
export function providerCostOf(usage: ItemMeasure['usage']): number | null {
  const c = usage?.cost ?? usage?.raw?.cost;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}

export const NO_COST_NOTE =
  'Not reported by the provider: the experiment results carry no cost, and Mastra’s estimatedCost (a price-table estimate in @mastra/observability) is not shown as cost.';

export function metricsOf(items: readonly ItemMeasure[], simulated: boolean): ComparisonMetrics {
  const passed = items.filter((i) => i.passed).length;
  const scores = items.map((i) => i.rubricScore).filter((s): s is number => s !== null);
  const sum = (k: 'inputTokens' | 'outputTokens' | 'totalTokens') =>
    items.every((i) => typeof i.usage?.[k] === 'number') && items.length
      ? items.reduce((n, i) => n + (i.usage![k] as number), 0)
      : null;
  const total = sum('totalTokens');
  const durations = items.map((i) => i.durationMs).filter((d): d is number => d !== null);
  const costs = items.map((i) => providerCostOf(i.usage));
  const allCosts = items.length > 0 && costs.every((c) => c !== null);
  return {
    total: items.length,
    passed,
    passRate: items.length ? r4(passed / items.length) : 0,
    meanScore: scores.length ? r4(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    scorable: scores.length,
    tokens: {
      input: sum('inputTokens'),
      output: sum('outputTokens'),
      total,
      source: total === null ? 'unavailable' : simulated ? 'simulated' : 'provider',
    },
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      mean: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    },
    cost: allCosts
      ? {
          value: r4((costs as number[]).reduce((a, b) => a + b, 0)),
          unit: 'USD',
          source: 'provider',
          note: 'Summed from the cost the provider reported in usage.',
        }
      : { value: null, unit: null, source: null, note: NO_COST_NOTE },
  };
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : r4(a - b));

export function deltasOf(cfg: ItemMeasure[], cfgMetrics: ComparisonMetrics, base: ItemMeasure[], baseMetrics: ComparisonMetrics) {
  const byExt = new Map(base.map((i) => [i.externalId, i]));
  let regressions = 0;
  let improvements = 0;
  for (const i of cfg) {
    const b = byExt.get(i.externalId);
    if (!b) continue;
    if (b.passed && !i.passed) regressions++;
    if (!b.passed && i.passed) improvements++;
  }
  return {
    passRate: diff(cfgMetrics.passRate, baseMetrics.passRate),
    meanScore: diff(cfgMetrics.meanScore, baseMetrics.meanScore),
    tokensTotal: diff(cfgMetrics.tokens.total, baseMetrics.tokens.total),
    latencyP50: diff(cfgMetrics.latencyMs.p50, baseMetrics.latencyMs.p50),
    regressions,
    improvements,
  };
}

/** Per-scenario matrix: each configuration's outcome, and its change against the baseline. */
export function itemMatrix(measures: Record<string, ItemMeasure[]>, baselineId: string): ExperimentComparison['items'] {
  const externalIds = [...new Set(Object.values(measures).flatMap((m) => m.map((i) => i.externalId)))].sort();
  return externalIds.map((externalId) => {
    const results: Record<string, { passed: boolean; score: number | null }> = {};
    const changes: Record<string, 'regression' | 'improvement' | 'same'> = {};
    let title = externalId;
    const base = measures[baselineId]?.find((i) => i.externalId === externalId);
    for (const [cfg, items] of Object.entries(measures)) {
      const i = items.find((x) => x.externalId === externalId);
      if (!i) continue;
      title = i.title || title;
      results[cfg] = { passed: i.passed, score: i.rubricScore };
      if (cfg !== baselineId && base)
        changes[cfg] = base.passed && !i.passed ? 'regression' : !base.passed && i.passed ? 'improvement' : 'same';
    }
    return { externalId, title, results, changes };
  });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const CSV_HEADER = [
  'config',
  'label',
  'experiment_id',
  'model',
  'provider',
  'pass_rate',
  'mean_score',
  'tokens_total',
  'token_source',
  'latency_p50_ms',
  'latency_p95_ms',
  'cost',
  'cost_source',
];
export function toCsv(configs: readonly ComparisonConfig[]): string {
  const rows = configs.map((c) =>
    [
      c.id,
      c.label,
      c.experimentId,
      c.modelId,
      c.provider,
      c.metrics.passRate,
      c.metrics.meanScore,
      c.metrics.tokens.total,
      c.metrics.tokens.source,
      c.metrics.latencyMs.p50,
      c.metrics.latencyMs.p95,
      c.metrics.cost.value,
      c.metrics.cost.source,
    ]
      .map(csvCell)
      .join(','),
  );
  return [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}

/** The parts of a comparison that must be identical when it is rebuilt or replayed (latency excluded). */
export function deterministicView(configs: readonly ComparisonConfig[], items: ExperimentComparison['items']) {
  return JSON.stringify({
    configs: configs.map((c) => ({
      id: c.id,
      passRate: c.metrics.passRate,
      meanScore: c.metrics.meanScore,
      tokens: c.metrics.tokens,
      cost: c.metrics.cost,
      regressions: c.deltas?.regressions ?? null,
      improvements: c.deltas?.improvements ?? null,
    })),
    items: items.map((i) => ({ id: i.externalId, results: i.results, changes: i.changes })),
  });
}

export const METRIC_DEFINITIONS = {
  passRate: 'Scenarios whose scenario-assertions score is 1, divided by all scenarios.',
  meanScore: 'Mean scenario-rubric score over the scenarios a rubric can score.',
  tokens:
    'Sum of usage.inputTokens / outputTokens / totalTokens over the scenarios; source simulated (mock provider) or provider.',
  latencyMs:
    'completedAt − startedAt per scenario; p50 and p95 are nearest-rank percentiles. Excluded from reproducibility checks.',
  cost: 'Only a cost the provider reported in usage; otherwise null with a note. Never a price-table estimate.',
};

/** Parses one RFC 4180 CSV line (quoted fields, doubled quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
