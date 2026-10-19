import { ScoreCardSchema, type ScoreCard as ScoreCardData } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';

/** Parses a lab result's `scoreCard`; anything that does not match the contract renders nothing. */
export function scoreCardOf(output: unknown): ScoreCardData | null {
  if (!output || typeof output !== 'object' || !('scoreCard' in output)) return null;
  const parsed = ScoreCardSchema.safeParse((output as { scoreCard: unknown }).scoreCard);
  return parsed.success ? parsed.data : null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Score, criteria with evidence and missing items, the formula, the reason and the golden fixtures, as text. */
export function ScoreCard({ data }: { data: ScoreCardData }) {
  const okFixtures = data.fixtures.filter((f) => f.ok).length;
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="score-card">
      <div className="flex flex-wrap items-center gap-2" role="status">
        <span className="text-2xl font-semibold tabular-nums">{data.score === null ? '—' : data.score}</span>
        {data.score === null ? (
          <Badge tone="warning">Not scorable</Badge>
        ) : data.passed ? (
          <Badge tone="success">Pass</Badge>
        ) : (
          <Badge tone="danger">Fail</Badge>
        )}
        <span className="text-sm text-fg-muted">
          threshold {data.passThreshold} · {data.scorerId} · rubric {data.rubricId}
        </span>
      </div>
      {data.notScorable ? <p className="text-sm text-fg-muted">{data.notScorable}</p> : null}

      {data.criteria.length ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Score criteria (scrollable)">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Score criteria</caption>
            <thead className="text-xs text-fg-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Criterion
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Weight
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Sub-score
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Contribution
                </th>
                <th scope="col" className="py-1 font-medium">
                  Evidence and missing
                </th>
              </tr>
            </thead>
            <tbody>
              {data.criteria.map((c) => (
                <tr key={c.id} className="border-t border-border align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium">
                    {c.label}
                    <span className="block text-xs font-normal text-fg-muted">{c.kind}</span>
                  </th>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {c.kind === 'penalty' || c.kind === 'constraint' ? `−${c.weight}` : c.weight}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{c.score}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{signed(c.contribution)}</td>
                  <td className="py-1.5">
                    {c.evidence.length ? (
                      <ul className="list-disc pl-4 text-xs" aria-label={`Evidence for ${c.label}`}>
                        {c.evidence.map((e, i) => (
                          <li key={i} className="[overflow-wrap:anywhere]">
                            {e}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {c.missing.length ? (
                      <ul className="list-disc pl-4 text-xs text-danger" aria-label={`Missing for ${c.label}`}>
                        {c.missing.map((m, i) => (
                          <li key={i} className="[overflow-wrap:anywhere]">
                            {m}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data.formula ? (
        <p className="font-mono text-xs [overflow-wrap:anywhere]" data-testid="score-formula">
          {data.formula}
        </p>
      ) : null}
      {data.reason ? <p className="text-sm [overflow-wrap:anywhere]">{data.reason}</p> : null}

      <details>
        <summary className="cursor-pointer text-sm font-medium">Expected output (reference answer)</summary>
        <p className="mt-1 text-sm [overflow-wrap:anywhere]">{data.reference}</p>
        <ul className="mt-1 list-disc pl-5 text-xs text-fg-muted" aria-label="Key points">
          {data.keyPoints.map((k) => (
            <li key={k.id}>{k.label}</li>
          ))}
        </ul>
      </details>

      {data.fixtures.length ? (
        <details open={okFixtures !== data.fixtures.length}>
          <summary className="cursor-pointer text-sm font-medium">
            Golden scorer fixtures: {okFixtures}/{data.fixtures.length} pass
          </summary>
          <ul className="mt-1 flex flex-col gap-1 text-xs" aria-label="Golden scorer fixtures">
            {data.fixtures.map((f, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                <span aria-hidden="true" className={f.ok ? 'text-success' : 'text-danger'}>
                  {f.ok ? '✓' : '✗'}
                </span>
                <span className="sr-only">{f.ok ? 'pass: ' : 'fail: '}</span> {f.rubricId} · {f.name}: expected{' '}
                {f.expectedScore ?? 'not scorable'}, got {f.actualScore ?? 'not scorable'} ({f.detail})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
