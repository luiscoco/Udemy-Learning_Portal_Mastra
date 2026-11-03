import type { WorkflowGraph as Graph, WorkflowGraphNode } from '@mlp/contracts';
import type { StepView } from '../../features/run/run-state';
import { cn } from '../../lib/cn';

export type NodeState = 'waiting' | 'running' | 'success' | 'failed' | 'suspended' | 'skipped' | 'not-reached';

const LABEL: Record<NodeState, string> = {
  waiting: 'Waiting',
  running: 'Running',
  success: 'Done',
  failed: 'Failed',
  suspended: 'Suspended',
  skipped: 'Skipped',
  'not-reached': 'Not reached',
};
const STYLE: Record<NodeState, string> = {
  waiting: 'border-border text-fg-muted',
  running: 'border-accent ring-2 ring-accent/40 text-fg',
  success: 'border-success text-fg',
  failed: 'border-danger bg-danger/10 text-fg',
  suspended: 'border-warning bg-warning/10 text-fg',
  skipped: 'border-dashed border-border text-fg-subtle',
  'not-reached': 'border-dashed border-border text-fg-subtle',
};
const DOT: Record<NodeState, string> = {
  waiting: 'bg-border-strong',
  running: 'bg-accent animate-pulse',
  success: 'bg-success',
  failed: 'bg-danger',
  suspended: 'bg-warning',
  skipped: 'bg-border',
  'not-reached': 'bg-border',
};

/**
 * A node's state: the latest workflow-step event with its id while the run streams; once the run has
 * finished, nodes without events take the server's final status (skipped / not reached).
 */
export function nodeState(
  node: WorkflowGraphNode,
  steps: StepView[],
  finished: boolean,
  finalStatuses?: Record<string, string>,
): NodeState {
  const step = steps.find((s) => s.stepId === node.id);
  if (step) {
    if (
      step.status === 'running' ||
      step.status === 'success' ||
      step.status === 'failed' ||
      step.status === 'suspended' ||
      step.status === 'skipped'
    )
      return step.status;
    if (step.status === 'waiting') return 'waiting';
  }
  const final = finalStatuses?.[node.id];
  if (final === 'skipped' || final === 'not-reached' || final === 'success' || final === 'failed' || final === 'suspended')
    return final;
  return finished ? 'not-reached' : 'waiting';
}

const W = 168;
const H = 56;
const GX = 44;
const GY = 18;

/** Read-only DAG of a workflow run, laid out by layer (column) and lane (row), coloured by live status. */
export function WorkflowGraph({
  graph,
  steps,
  finished,
  finalStatuses,
}: {
  graph: Graph;
  steps: StepView[];
  finished: boolean;
  finalStatuses?: Record<string, string>;
}) {
  const layers = Math.max(1, ...graph.nodes.map((n) => n.layer + 1));
  const lanes = Math.max(1, ...graph.nodes.map((n) => n.lane + 1));
  const width = layers * (W + GX) - GX;
  const height = lanes * (H + GY) - GY;
  const pos = new Map(graph.nodes.map((n) => [n.id, { x: n.layer * (W + GX), y: n.lane * (H + GY) }]));
  const states = new Map(graph.nodes.map((n) => [n.id, nodeState(n, steps, finished, finalStatuses)]));
  const markerId = `arrow-${graph.workflowId.replace(/[^a-z0-9-]/gi, '')}`;

  return (
    <figure className="flex flex-col gap-3" data-testid="workflow-graph">
      <figcaption className="text-sm font-medium">{graph.title}</figcaption>
      <div
        role="region"
        className="overflow-x-auto rounded-lg border border-border p-3"
        tabIndex={0}
        aria-label={`Workflow graph: ${graph.title}`}
      >
        <div className="relative" style={{ width, height }} aria-hidden="true">
          <svg width={width} height={height} className="absolute inset-0 overflow-visible text-border-strong">
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {graph.edges.map((e, i) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + W;
              const y1 = a.y + H / 2;
              const x2 = b.x;
              const y2 = b.y + H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 2} ${y2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray={e.kind === 'branch' ? '4 3' : undefined}
                    markerEnd={`url(#${markerId})`}
                  />
                  {e.label && e.kind === 'branch' && i === graph.edges.findIndex((x) => x.to === e.to) ? (
                    <text x={x2 - 4} y={y2 - 6} textAnchor="end" className="fill-current text-[10px]">
                      if {e.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {graph.nodes.map((n) => {
            const s = states.get(n.id)!;
            const p = pos.get(n.id)!;
            return (
              <div
                key={n.id}
                data-testid="workflow-node"
                data-node={n.id}
                data-status={s}
                title={n.description ?? n.label}
                className={cn(
                  'absolute flex flex-col justify-center rounded-lg border-2 bg-surface px-2 text-xs',
                  STYLE[s],
                  n.group && 'border-l-[6px]',
                )}
                style={{ left: p.x, top: p.y, width: W, height: H }}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[s])} />
                  <span className="truncate">{n.label}</span>
                </span>
                <span className="mt-0.5 truncate text-[11px] text-fg-muted">
                  {LABEL[s]}
                  {n.kind === 'workflow'
                    ? ' · nested workflow'
                    : n.group
                      ? ` · in ${n.group}`
                      : n.kind === 'parallel'
                        ? ' · parallel'
                        : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <ol aria-label="Workflow steps" className="grid gap-1 text-sm sm:grid-cols-2">
        {graph.nodes.map((n) => (
          <li key={n.id} className="flex justify-between gap-3 rounded border border-border px-2 py-1">
            <span className="truncate">
              {n.group ? `${n.group} › ` : ''}
              {n.label}
            </span>
            <span className="shrink-0 font-medium" data-testid="workflow-step-status">
              {LABEL[states.get(n.id)!]}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The workflows a run says the learner may see (lab output `visible`), if present. */
export function visibleWorkflowsOf(output: unknown): { id: string; title: string }[] | null {
  const v = (output as { visible?: unknown } | undefined)?.visible;
  return Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
    ? (v as { id: string; title: string }[])
    : null;
}
