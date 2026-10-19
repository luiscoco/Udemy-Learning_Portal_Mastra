import { EvalReportSchema, type EvalReport as EvalReportData } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';

/** Parses a lab result's `evalReport`; anything that does not match the contract renders nothing. */
export function evalReportOf(output: unknown): EvalReportData | null {
  if (!output || typeof output !== 'object' || !('evalReport' in output)) return null;
  const parsed = EvalReportSchema.safeParse((output as { evalReport: unknown }).evalReport);
  return parsed.success ? parsed.data : null;
}

/** Dataset and versions, the experiment, a summary and every scenario with its answer, scores and assertions. */
export function EvalReport({ data }: { data: EvalReportData }) {
  const { dataset, experiment, summary } = data;
  const revisionOf = (v: number) => Object.entries(dataset.revisionVersions).find(([, x]) => x === v)?.[0];
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="eval-report">
      <div className="flex flex-wrap items-center gap-2" role="status">
        <span className="text-2xl font-semibold tabular-nums">
          {summary.passed}/{summary.total}
        </span>
        <span className="text-sm text-fg-muted">scenarios pass (pass rate {summary.passRate})</span>
        {summary.errored ? <Badge tone="danger">{summary.errored} errored</Badge> : null}
        <Badge tone={experiment.provider === 'offline-sim' ? 'neutral' : 'accent'}>
          {experiment.provider === 'offline-sim' ? 'mock provider (offline)' : experiment.provider}
        </Badge>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs text-fg-muted sm:grid-cols-[auto_1fr]">
        <dt>Dataset</dt>
        <dd className="[overflow-wrap:anywhere]">
          {dataset.name} ({dataset.id}), latest version {dataset.version}, seed revision {dataset.seedRevision}
        </dd>
        <dt>Experiment</dt>
        <dd className="font-mono [overflow-wrap:anywhere]">
          {experiment.id} · version {experiment.datasetVersion}
          {experiment.revision !== null ? ` (revision ${experiment.revision})` : ''} · {experiment.status} ·{' '}
          {experiment.durationMs} ms
        </dd>
        <dt>Target</dt>
        <dd>{experiment.targetId}</dd>
      </dl>

      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Dataset versions">
        {dataset.versions.map((v) => (
          <li key={v.version}>
            <Badge tone={v.version === experiment.datasetVersion ? 'accent' : 'neutral'}>
              v{v.version}
              {revisionOf(v.version) ? ` = revision ${revisionOf(v.version)}` : ''}
              {v.version === experiment.datasetVersion ? ' (this run)' : ''}
            </Badge>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col gap-2" aria-label="Scenarios">
        {data.items.map((i) => (
          <li key={i.itemId} className="min-w-0 rounded-lg border border-border px-3 py-2">
            <details>
              <summary className="cursor-pointer text-sm [overflow-wrap:anywhere]">
                <span aria-hidden="true" className={i.passed ? 'text-success' : 'text-danger'}>
                  {i.passed ? '✓' : '✗'}
                </span>
                <span className="sr-only">{i.passed ? 'passed: ' : 'failed: '}</span>{' '}
                <span className="font-medium">{i.title ?? i.externalId ?? i.itemId}</span>{' '}
                <span className="text-fg-muted">
                  {i.assertions.filter((a) => a.passed).length}/{i.assertions.length} assertions
                  {i.durationMs !== null ? ` · ${i.durationMs} ms` : ''}
                  {i.itemVersion !== null ? ` · item v${i.itemVersion}` : ''}
                </span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 text-xs">
                <p className="[overflow-wrap:anywhere]">
                  <span className="font-medium">Input:</span> {i.input}
                </p>
                <p className="[overflow-wrap:anywhere]">
                  <span className="font-medium">Answer:</span> {i.answer || '(empty)'}
                </p>
                {i.error ? <p className="text-danger [overflow-wrap:anywhere]">Error: {i.error}</p> : null}
                <ul className="flex flex-col gap-0.5" aria-label={`Assertions of ${i.title ?? i.itemId}`}>
                  {i.assertions.map((a) => (
                    <li key={a.id} className="[overflow-wrap:anywhere]">
                      <span aria-hidden="true" className={a.passed ? 'text-success' : 'text-danger'}>
                        {a.passed ? '✓' : '✗'}
                      </span>
                      <span className="sr-only">{a.passed ? 'holds: ' : 'fails: '}</span> {a.label} ({a.detail})
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-col gap-0.5 text-fg-muted" aria-label={`Scores of ${i.title ?? i.itemId}`}>
                  {i.scores.map((s) => (
                    <li key={s.scorerId} className="[overflow-wrap:anywhere]">
                      {s.scorerId}: {s.score ?? (s.notScorable ? `not scorable (${s.notScorable})` : '—')}
                      {s.reason ? ` · ${s.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
