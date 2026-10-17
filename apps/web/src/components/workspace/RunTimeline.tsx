import type { ExecutionEvent } from '@mlp/contracts';
import type { RunState } from '../../features/run/run-state';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/primitives';

export function JsonView({ value, label }: { value: unknown; label: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-h-80 max-w-full overflow-auto rounded-lg bg-code-bg p-3 font-mono text-xs leading-5 text-code-fg"
    >
      {value === undefined ? '—' : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function describe(e: ExecutionEvent): string {
  switch (e.type) {
    case 'log':
      return `[${e.level}] ${e.message}`;
    case 'tool-start':
      return `${e.toolName} called (${e.toolCallId})`;
    case 'tool-finish':
      return `${e.toolName} ${e.status} in ${Math.round(e.durationMs)} ms`;
    case 'workflow-step':
      return `step ${e.stepId}: ${e.status}`;
    case 'approval-request':
      return `approval needed for ${e.toolName}: ${e.message}`;
    case 'approval-resolved':
      return `approval ${e.decision === 'approve' ? 'approved' : 'declined'} (${e.by === 'user' ? 'by you' : e.by === 'timeout' ? 'timed out' : 'server approval limit reached'})`;
    case 'result':
      return e.validation ? `result — checks ${e.validation.passed ? 'passed' : 'failed'}` : 'result';
    case 'error':
      return `${e.code}: ${e.message}`;
    case 'complete':
      return `complete — ${e.status} in ${Math.round(e.durationMs)} ms`;
    case 'token':
      return e.text;
  }
}

const TONE: Partial<Record<ExecutionEvent['type'], 'accent' | 'success' | 'danger' | 'warning' | 'neutral'>> = {
  'tool-start': 'accent',
  'tool-finish': 'accent',
  'workflow-step': 'warning',
  'approval-request': 'warning',
  'approval-resolved': 'accent',
  result: 'success',
  error: 'danger',
  complete: 'neutral',
};

/** Event timeline. Tokens are summarised (one row per run) to keep the DOM small. */
export function RunTimeline({ state }: { state: RunState }) {
  const rows = state.events.filter((e) => e.type !== 'token');
  if (state.events.length === 0) {
    return <p className="text-sm text-fg-muted">No events yet. Press Run to start; events appear here as they stream in.</p>;
  }
  return (
    <ol className="flex flex-col gap-1 font-mono text-xs" aria-label="Event timeline" data-testid="timeline">
      {rows.map((e) => (
        <li key={e.seq} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-md px-2 py-1 odd:bg-surface-muted">
          <span className="w-8 shrink-0 text-right text-fg-subtle">{e.seq}</span>
          <Badge tone={TONE[e.type] ?? 'neutral'} className="shrink-0 font-sans">
            {e.type}
          </Badge>
          {/* min-w-0 + overflow-wrap:anywhere so long unbroken tokens (ids, dotted names) wrap on phones */}
          <span className={cn('min-w-0 [overflow-wrap:anywhere]', e.type === 'error' ? 'text-danger' : 'text-fg')}>
            {describe(e)}
          </span>
          {e.annotations ? (
            <span className="ml-auto min-w-0 break-all text-fg-subtle">{JSON.stringify(e.annotations)}</span>
          ) : null}
        </li>
      ))}
      {state.tokenCount > 0 ? (
        <li className="px-2 py-1 text-fg-muted" data-testid="token-count">
          {state.tokenCount} token event{state.tokenCount === 1 ? '' : 's'} streamed
        </li>
      ) : null}
    </ol>
  );
}

export function TraceView({ state }: { state: RunState }) {
  if (state.tools.length === 0 && state.steps.length === 0) {
    return <p className="text-sm text-fg-muted">No tool calls or workflow steps recorded.</p>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Workflow steps</h4>
        <ul className="flex flex-col gap-1 text-sm">
          {state.steps.map((s) => (
            <li key={s.stepId} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5">
              <span className="font-mono">{s.stepId}</span>
              <Badge tone={s.status === 'success' ? 'success' : s.status === 'failed' ? 'danger' : 'warning'}>{s.status}</Badge>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">Tool calls</h4>
        <ul className="flex flex-col gap-2 text-sm">
          {state.tools.map((t) => (
            <li key={t.toolCallId} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{t.toolName}</span>
                <Badge tone={t.status === 'success' ? 'success' : t.status === 'running' ? 'warning' : 'danger'}>
                  {t.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-fg-muted">Arguments</p>
              <JsonView value={t.args} label={`${t.toolName} arguments`} />
              <p className="mt-2 text-xs text-fg-muted">Result</p>
              <JsonView value={t.error ?? t.result} label={`${t.toolName} result`} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
