import { useEffect, useState } from 'react';
import type { HealthResponse } from '@mlp/contracts';
import { fetchHealth } from '../api/client';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

export function HealthStatus({ load = fetchHealth }: { load?: typeof fetchHealth }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal)
      .then((health) => setState({ kind: 'ok', health }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => ctrl.abort();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <p role="status" className="text-sm text-slate-500">
        Checking API…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-sm text-red-700">
        API unavailable: {state.message}
      </p>
    );
  }
  const { health } = state;
  return (
    <dl role="status" aria-label="API health" className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-slate-500">API</dt>
      <dd data-testid="api-status" className="font-medium text-emerald-700">
        {health.status}
      </dd>
      <dt className="text-slate-500">Mode</dt>
      <dd>{health.mode}</dd>
      <dt className="text-slate-500">Mastra</dt>
      <dd>@mastra/core {health.mastraVersion}</dd>
    </dl>
  );
}
