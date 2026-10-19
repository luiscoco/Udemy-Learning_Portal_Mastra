import { ExperimentComparisonSchema, type ExperimentComparison as Data } from '@mlp/contracts';
import { Badge, Button, Card } from '../ui/primitives';

/** Parses a lab result's `comparison`; anything that does not match the contract renders nothing. */
export function comparisonOf(output: unknown): Data | null {
  if (!output || typeof output !== 'object' || !('comparison' in output)) return null;
  const parsed = ExperimentComparisonSchema.safeParse((output as { comparison: unknown }).comparison);
  return parsed.success ? parsed.data : null;
}

const fmt = (v: number | null, suffix = '') => (v === null ? '—' : `${v}${suffix}`);
const signed = (v: number | null) => (v === null ? '' : v > 0 ? ` (+${v})` : v < 0 ? ` (−${Math.abs(v)})` : ' (±0)');

/** Starts a browser download of text content (no network request). */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CHANGE_TEXT = { regression: 'regression', improvement: 'improvement', same: '' } as const;

/** Configurations × metrics with deltas, the per-scenario matrix, notes and the exports. */
export function ExperimentComparison({ data }: { data: Data }) {
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="experiment-comparison">
      <p className="text-sm text-fg-muted">
        Dataset {data.datasetId}, version {data.datasetVersion}. Baseline:{' '}
        <span className="font-medium text-fg">{data.baselineConfigId}</span>.
      </p>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Configuration metrics (scrollable)">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">Metrics per configuration, with the change against the baseline in brackets</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              {['Configuration', 'Pass rate', 'Mean score', 'Tokens', 'Latency p50 / p95', 'Cost', 'Regressions'].map((h) => (
                <th key={h} scope="col" className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.configs.map((c) => (
              <tr key={c.id} className="border-t border-border align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium">
                  {c.label}
                  {c.id === data.baselineConfigId ? (
                    <Badge tone="accent" className="ml-1">
                      baseline
                    </Badge>
                  ) : null}
                  <span className="block text-xs font-normal text-fg-muted [overflow-wrap:anywhere]">
                    {c.modelId} · {c.provider} · tools: {c.tools.join(', ') || 'none'}
                  </span>
                </th>
                <td className="py-1.5 pr-3 tabular-nums">
                  {c.metrics.passRate}
                  {signed(c.deltas?.passRate ?? null)}
                  <span className="block text-xs text-fg-muted">
                    {c.metrics.passed}/{c.metrics.total}
                  </span>
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {fmt(c.metrics.meanScore)}
                  {signed(c.deltas?.meanScore ?? null)}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {fmt(c.metrics.tokens.total)}
                  {signed(c.deltas?.tokensTotal ?? null)}
                  <span className="block text-xs text-fg-muted">{c.metrics.tokens.source}</span>
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {fmt(c.metrics.latencyMs.p50, ' ms')} / {fmt(c.metrics.latencyMs.p95, ' ms')}
                </td>
                <td className="py-1.5 pr-3">
                  {c.metrics.cost.value === null ? (
                    <span className="text-xs text-fg-muted">not reported</span>
                  ) : (
                    `${c.metrics.cost.value} ${c.metrics.cost.unit ?? ''}`
                  )}
                </td>
                <td className="py-1.5 tabular-nums">{c.deltas ? `${c.deltas.regressions} / +${c.deltas.improvements}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scenario results (scrollable)">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Outcome of each scenario per configuration</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Scenario
              </th>
              {data.configs.map((c) => (
                <th key={c.id} scope="col" className="py-1 pr-3 font-medium">
                  {c.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.externalId} className="border-t border-border">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {i.title}
                </th>
                {data.configs.map((c) => {
                  const r = i.results[c.id];
                  const change = i.changes[c.id];
                  return (
                    <td key={c.id} className="py-1 pr-3">
                      {r ? (
                        <>
                          <span className={r.passed ? 'text-success' : 'text-danger'}>{r.passed ? 'pass' : 'fail'}</span>
                          {r.score !== null ? <span className="text-xs text-fg-muted"> {r.score}</span> : null}
                          {change && change !== 'same' ? (
                            <Badge tone={change === 'regression' ? 'danger' : 'success'} className="ml-1">
                              {CHANGE_TEXT[change]}
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.notes.length ? (
        <ul className="list-disc pl-5 text-xs text-fg-muted" aria-label="Comparison notes">
          {data.notes.map((n, k) => (
            <li key={k}>{n}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => download(`${data.export.filename}.json`, data.export.json, 'application/json')}
        >
          Download JSON
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => download(`${data.export.filename}.csv`, data.export.csv, 'text/csv')}
        >
          Download CSV
        </Button>
      </div>
    </Card>
  );
}
