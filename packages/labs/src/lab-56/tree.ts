import type { AnyExportedSpan } from '@mastra/core/observability';
import type { TraceSpan } from '@mlp/contracts';

/** Span types shown in the summary view; the others are folded into their nearest shown ancestor. */
export const SUMMARY_TYPES = new Set([
  'workflow_run',
  'workflow_step',
  'workflow_parallel',
  'workflow_loop',
  'workflow_conditional',
  'agent_run',
  'model_generation',
  'tool_call',
  'mcp_tool_call',
]);

const ms = (d: unknown) =>
  d instanceof Date ? d.getTime() : typeof d === 'string' || typeof d === 'number' ? new Date(d).getTime() : NaN;
const scalar = (v: unknown) =>
  typeof v === 'string' ? v.slice(0, 200) : typeof v === 'number' || typeof v === 'boolean' ? v : v === null ? null : undefined;

/** The few attributes worth showing; never inputs, outputs, instructions or stack traces. */
function pickAttributes(s: AnyExportedSpan): TraceSpan['attributes'] {
  const a = (s.attributes ?? {}) as Record<string, unknown>;
  const out: TraceSpan['attributes'] = {};
  for (const k of ['model', 'provider', 'toolCallId', 'success', 'status', 'finishReason', 'stepIndex']) {
    const v = scalar(a[k]);
    if (v !== undefined) out[k] = v;
  }
  const usage = a.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  if (usage && typeof usage.inputTokens === 'number') out.inputTokens = usage.inputTokens;
  if (usage && typeof usage.outputTokens === 'number') out.outputTokens = usage.outputTokens;
  return out;
}

/** The error message only: the stack (with absolute file paths) is never exported. */
export const errorMessage = (s: AnyExportedSpan) => {
  const m = (s.errorInfo as { message?: unknown } | undefined)?.message;
  return typeof m === 'string' && m ? m.split('\n')[0]!.slice(0, 300) : null;
};

/** Flattens Mastra spans to the TraceSpan contract, with times relative to the earliest start. */
export function toTraceSpans(spans: readonly AnyExportedSpan[]): TraceSpan[] {
  const t0 = Math.min(...spans.map((s) => ms(s.startTime)).filter(Number.isFinite));
  return [...spans]
    .sort((a, b) => ms(a.startTime) - ms(b.startTime))
    .map((s) => {
      const start = ms(s.startTime);
      const end = ms(s.endTime);
      return {
        id: s.id,
        parentId: s.parentSpanId ?? null,
        traceId: s.traceId,
        name: s.name.slice(0, 200),
        type: String(s.type),
        entity: s.entityId ? String(s.entityId).slice(0, 120) : null,
        startMs: Math.max(0, Math.round(start - t0)),
        durationMs: Number.isFinite(end) ? Math.max(0, Math.round(end - start)) : null,
        status: errorMessage(s) ? 'error' : Number.isFinite(end) ? 'ok' : 'open',
        error: errorMessage(s),
        attributes: pickAttributes(s),
        correlationId: typeof s.metadata?.correlationId === 'string' ? s.metadata.correlationId.slice(0, 120) : null,
      } satisfies TraceSpan;
    });
}

/**
 * The summary view keeps the SUMMARY_TYPES spans and re-parents each one to its nearest kept ancestor,
 * so the tree stays connected. The full view returns every span unchanged.
 */
export function viewOf(spans: readonly TraceSpan[], view: 'summary' | 'full'): { spans: TraceSpan[]; hidden: number } {
  if (view === 'full') return { spans: [...spans], hidden: 0 };
  const byId = new Map(spans.map((s) => [s.id, s]));
  const kept = spans.filter((s) => SUMMARY_TYPES.has(s.type));
  const keptIds = new Set(kept.map((s) => s.id));
  const nearestKept = (id: string | null): string | null => {
    let cur = id;
    for (let guard = 0; cur && guard < 1_000; guard++) {
      if (keptIds.has(cur)) return cur;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return null;
  };
  return { spans: kept.map((s) => ({ ...s, parentId: nearestKept(s.parentId) })), hidden: spans.length - kept.length };
}
