import { TraceTreeSchema, type TraceSpan, type TraceTree } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';

/** Parses a lab result's `traceTree`; anything that does not match the contract renders nothing. */
export function traceTreeOf(output: unknown): TraceTree | null {
  if (!output || typeof output !== 'object' || !('traceTree' in output)) return null;
  const parsed = TraceTreeSchema.safeParse((output as { traceTree: unknown }).traceTree);
  return parsed.success ? parsed.data : null;
}

const TYPE_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning'> = {
  workflow_run: 'accent',
  workflow_step: 'neutral',
  workflow_parallel: 'neutral',
  agent_run: 'success',
  model_generation: 'warning',
  tool_call: 'accent',
};

interface Node {
  span: TraceSpan;
  children: Node[];
}

/** Builds the tree from parent ids; spans whose parent is not in the list become roots (and are marked). */
export function buildTree(spans: readonly TraceSpan[]): Node[] {
  const nodes = new Map(spans.map((s) => [s.id, { span: s, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const p = n.span.parentId ? nodes.get(n.span.parentId) : undefined;
    if (p) p.children.push(n);
    else roots.push(n);
  }
  return roots;
}

function SpanNode({ node, total, rootIds }: { node: Node; total: number; rootIds: Set<string> }) {
  const s = node.span;
  const left = total > 0 ? (s.startMs / total) * 100 : 0;
  const width = total > 0 && s.durationMs !== null ? Math.max(0.5, (s.durationMs / total) * 100) : 0.5;
  const orphan = s.parentId !== null && rootIds.has(s.id);
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border px-2 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium [overflow-wrap:anywhere]">{s.name}</span>
          <Badge tone={TYPE_TONE[s.type] ?? 'neutral'}>{s.type}</Badge>
          {s.status === 'error' ? <Badge tone="danger">error</Badge> : null}
          {s.status === 'open' ? <Badge tone="warning">not ended</Badge> : null}
          {orphan ? <Badge tone="danger">parent missing</Badge> : null}
          <span className="text-xs text-fg-muted">
            +{s.startMs} ms, {s.durationMs === null ? '—' : `${s.durationMs} ms`}
          </span>
        </div>
        <div className="relative h-1.5 w-full rounded bg-surface-muted" aria-hidden="true">
          <div
            className={`absolute h-1.5 rounded ${s.status === 'error' ? 'bg-danger' : 'bg-accent'}`}
            style={{ left: `${Math.min(left, 99.5)}%`, width: `${Math.min(width, 100 - Math.min(left, 99.5))}%` }}
          />
        </div>
        {s.error ? <p className="text-xs text-danger [overflow-wrap:anywhere]">{s.error}</p> : null}
        {Object.keys(s.attributes).length ? (
          <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">
            {Object.entries(s.attributes)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(' · ')}
          </p>
        ) : null}
      </div>
      {node.children.length ? (
        <ul className="ml-3 mt-1 flex flex-col gap-1 border-l border-border pl-3" aria-label={`Children of ${s.name}`}>
          {node.children.map((c) => (
            <SpanNode key={c.span.id} node={c} total={total} rootIds={rootIds} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The trace as a nested list of spans with timing bars; text only (no span content is rendered as HTML). */
export function SpanTree({ data }: { data: TraceTree }) {
  const roots = buildTree(data.spans);
  const total = Math.max(1, ...data.spans.map((s) => s.startMs + (s.durationMs ?? 0)));
  const rootIds = new Set(roots.map((r) => r.span.id));
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4" data-testid="span-tree">
      <dl className="grid gap-x-4 gap-y-1 text-xs text-fg-muted sm:grid-cols-[auto_1fr]">
        <dt>Trace id</dt>
        <dd className="font-mono [overflow-wrap:anywhere]">{data.traceId ?? 'none'}</dd>
        <dt>Correlation id</dt>
        <dd className="font-mono [overflow-wrap:anywhere]">{data.correlation.correlationId}</dd>
        <dt>Workflow run</dt>
        <dd className="font-mono [overflow-wrap:anywhere]">{data.correlation.workflowRunId ?? 'none'}</dd>
        <dt>View</dt>
        <dd>
          {data.view === 'summary' ? `Summary (${data.hiddenSpans} detail spans folded into their parents)` : 'Full'},{' '}
          {data.spans.length} spans
        </dd>
      </dl>
      {data.findings.length ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Trace findings">
          {data.findings.map((f, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Span tree (scrollable)">
        <ul className="flex min-w-[22rem] flex-col gap-1" aria-label="Trace spans">
          {roots.map((r) => (
            <SpanNode key={r.span.id} node={r} total={total} rootIds={rootIds} />
          ))}
        </ul>
      </div>
    </Card>
  );
}
