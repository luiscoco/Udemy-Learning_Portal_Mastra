import { useState } from 'react';
import { QualityDashboardSchema, type QualityDashboard as Data } from '@mlp/contracts';
import { Badge, Button, Card } from '../ui/primitives';
import { SpanTree } from './SpanTree';

/** Parses a lab result's `dashboard`; anything that does not match the contract renders nothing. */
export function dashboardOf(output: unknown): Data | null {
  if (!output || typeof output !== 'object' || !('dashboard' in output)) return null;
  const parsed = QualityDashboardSchema.safeParse((output as { dashboard: unknown }).dashboard);
  return parsed.success ? parsed.data : null;
}

const show = (v: number | null, suffix = '') => (v === null ? '—' : `${v}${suffix}`);
const trend = (now: number, before: number | undefined) =>
  before === undefined ? '' : now > before ? '↑ up' : now < before ? '↓ down' : '= same';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-fg-muted">{hint}</dd> : null}
    </div>
  );
}

/** KPIs, run history, regressions, latency and latest scenarios with trace links; empty states when there is no data. */
export function QualityDashboard({ data }: { data: Data }) {
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const k = data.kpis;
  const traceButton = (traceId: string | null, label: string) =>
    traceId && data.traces[traceId] ? (
      <Button variant="ghost" size="sm" onClick={() => setOpenTrace(traceId)} aria-label={`Open trace of ${label}`}>
        Open trace
      </Button>
    ) : (
      <span className="text-xs text-fg-muted">trace not recorded</span>
    );

  if (data.empty.isEmpty)
    return (
      <Card className="flex min-w-0 flex-col gap-2 p-4" data-testid="quality-dashboard">
        <div role="status">
          <p className="font-medium">No quality data yet</p>
          <p className="text-sm text-fg-muted">{data.empty.message}</p>
        </div>
        <ul className="list-disc pl-5 text-sm" aria-label="Next steps">
          {data.empty.actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
        <p className="text-xs text-fg-muted">KPIs stay empty (not 0) until a run exists.</p>
      </Card>
    );

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="quality-dashboard">
      <section aria-label="Key indicators">
        <dl className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Latest pass rate" value={show(k.latestPassRate)} />
          <Kpi
            label="Change vs previous run"
            value={
              k.passRateDelta === null
                ? '—'
                : `${k.passRateDelta > 0 ? '+' : k.passRateDelta < 0 ? '−' : '±'}${Math.abs(k.passRateDelta)}`
            }
            hint={k.passRateDelta === null ? 'needs two runs' : undefined}
          />
          <Kpi label="Regressions" value={show(k.regressions)} hint={k.regressions === null ? 'needs two runs' : undefined} />
          <Kpi label="Latency p50" value={show(k.latestP50, ' ms')} />
          <Kpi label="Latency p95" value={show(k.latestP95, ' ms')} />
          <Kpi label="Stored runs" value={String(k.runs)} />
        </dl>
      </section>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Run history (scrollable)">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Run history, oldest first</caption>
          <thead className="text-xs text-fg-muted">
            <tr>
              {['Run', 'Configuration', 'Dataset version', 'Pass rate', 'Trend', 'Latency p50 / p95 / p99', 'Errors'].map((h) => (
                <th key={h} scope="col" className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.runs.map((r, i) => (
              <tr key={r.experimentId} className="border-t border-border">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {i + 1}. <span className="text-xs font-normal text-fg-muted">{r.startedAt.replace('T', ' ').slice(0, 19)}</span>
                </th>
                <td className="py-1 pr-3">{r.configId ?? r.name}</td>
                <td className="py-1 pr-3 tabular-nums">{show(r.datasetVersion)}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {r.passRate} ({r.passed}/{r.total})
                </td>
                <td className="py-1 pr-3">{trend(r.passRate, data.runs[i - 1]?.passRate)}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {show(r.latency.p50)} / {show(r.latency.p95)} / {show(r.latency.p99)} ms
                </td>
                <td className="py-1 tabular-nums">{r.errored}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-label="Regressions">
        <h4 className="text-sm font-semibold">Regressions since the previous run</h4>
        {data.regressions.needsTwoRuns ? (
          <p className="text-sm text-fg-muted">Regressions need two runs. Record another run to compare.</p>
        ) : data.regressions.items.length === 0 ? (
          <p className="text-sm text-fg-muted">No regressions: nothing that passed before fails now.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm" aria-label="Regressed scenarios">
            {data.regressions.items.map((r) => (
              <li key={r.externalId} className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
                <Badge tone="danger">regression</Badge>
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-fg-muted">{r.failedAssertions.join('; ')}</span>
                {traceButton(r.traceId, r.title)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Latest run">
        <h4 className="text-sm font-semibold">Latest run</h4>
        <ul className="mt-1 flex flex-col gap-1 text-sm" aria-label="Latest scenarios">
          {data.latestItems.map((i) => (
            <li key={i.externalId} className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
              <span aria-hidden="true" className={i.passed ? 'text-success' : 'text-danger'}>
                {i.passed ? '✓' : '✗'}
              </span>
              <span className="sr-only">{i.passed ? 'passed: ' : 'failed: '}</span>
              <span className="font-medium">{i.title}</span>
              <span className="text-xs text-fg-muted">{show(i.durationMs, ' ms')}</span>
              {!i.passed && i.failedAssertions.length ? (
                <span className="text-xs text-danger">{i.failedAssertions.join('; ')}</span>
              ) : null}
              {traceButton(i.traceId, i.title)}
            </li>
          ))}
        </ul>
      </section>

      {openTrace && data.traces[openTrace] ? (
        <section aria-label="Trace" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Trace <span className="font-mono text-xs">{openTrace}</span>
            </h4>
            <Button variant="ghost" size="sm" onClick={() => setOpenTrace(null)}>
              Close trace
            </Button>
          </div>
          <SpanTree
            data={{
              traceId: openTrace,
              rootSpanId: data.traces[openTrace]!.find((s) => s.parentId === null)?.id ?? null,
              correlation: {
                labRunId: '—',
                correlationId: data.traces[openTrace]![0]?.correlationId ?? '—',
                workflowRunId: null,
              },
              view: 'full',
              spans: data.traces[openTrace]!,
              hiddenSpans: 0,
              findings: [],
            }}
          />
        </section>
      ) : null}

      {data.notes.length ? (
        <ul className="list-disc pl-5 text-xs text-fg-muted" aria-label="Dashboard notes">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
