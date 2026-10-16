import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

/** Runs an abortable loader whenever `key` changes; exposes retry. */
export function useAsync<T>(key: string, load: (signal: AbortSignal) => Promise<T>): AsyncState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const token = `${key}#${attempt}`;
  const [state, setState] = useState<{ token: string; value: AsyncState<T> }>({ token, value: { status: 'loading' } });

  // Reset to loading during render when the key/attempt changes (no setState inside the effect body).
  if (state.token !== token) setState({ token, value: { status: 'loading' } });

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setState({ token, value: { status: 'success', data } }),
      (error: unknown) =>
        !ctrl.signal.aborted &&
        setState({ token, value: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } }),
    );
    return () => ctrl.abort();
    // `load` is intentionally keyed by `token`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...(state.token === token ? state.value : { status: 'loading' }), retry };
}
