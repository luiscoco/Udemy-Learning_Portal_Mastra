import type { TraceSpan } from '@mlp/contracts';
import type { CallLogEntry } from './pipeline.js';

export const TOLERANCE_MS = 5;

export interface Coherence {
  roots: TraceSpan[];
  traceIds: string[];
  /** Spans whose parent is not in the trace. */
  orphans: TraceSpan[];
  /** Spans whose time window is not inside their parent's (± tolerance). */
  outsideParent: TraceSpan[];
  /** workflow_step spans whose parent is not a workflow run or a parallel span. */
  misplacedSteps: TraceSpan[];
  /** Agent calls from the app's call log, matched to their agent_run span (null = untraced). */
  agentCalls: (CallLogEntry & { spanId: string | null })[];
  /** Tool spans whose nearest agent_run ancestor is missing. */
  strayTools: TraceSpan[];
}

/** Structural checks on a full (not summarised) span list. */
export function analyseCoherence(spans: readonly TraceSpan[], calls: readonly CallLogEntry[]): Coherence {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const parentOf = (s: TraceSpan) => (s.parentId ? byId.get(s.parentId) : undefined);
  const ancestor = (s: TraceSpan, type: string): TraceSpan | undefined => {
    let cur = parentOf(s);
    for (let guard = 0; cur && guard < 1_000; guard++, cur = parentOf(cur)) if (cur.type === type) return cur;
    return undefined;
  };
  const roots = spans.filter((s) => s.parentId === null);
  const orphans = spans.filter((s) => s.parentId !== null && !byId.has(s.parentId));
  const outsideParent = spans.filter((s) => {
    const p = parentOf(s);
    if (!p || s.durationMs === null || p.durationMs === null) return false;
    return s.startMs + TOLERANCE_MS < p.startMs || s.startMs + s.durationMs > p.startMs + p.durationMs + TOLERANCE_MS;
  });
  const misplacedSteps = spans.filter(
    (s) => s.type === 'workflow_step' && !['workflow_run', 'workflow_parallel'].includes(parentOf(s)?.type ?? ''),
  );
  const agentCalls = calls.map((c) => {
    const step = spans.find((s) => s.type === 'workflow_step' && s.entity === c.stepId);
    const run = spans.find((s) => s.type === 'agent_run' && s.entity === c.agentId && step && s.parentId === step.id);
    return { ...c, spanId: run?.id ?? null };
  });
  const strayTools = spans.filter((s) => s.type === 'tool_call' && !ancestor(s, 'agent_run'));
  return {
    roots,
    traceIds: [...new Set(spans.map((s) => s.traceId))],
    orphans,
    outsideParent,
    misplacedSteps,
    agentCalls,
    strayTools,
  };
}
