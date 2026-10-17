import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ApprovalDecision, ExecutionRequest } from '@mlp/contracts';
import { ApiClientError } from '../../api/client';
import { cancelRun, decideApproval, startRun, streamRunEvents } from '../../api/runs';
import { initialRunState, runReducer, type RunState } from './run-state';

function toRunError(err: unknown) {
  if (err instanceof ApiClientError) {
    return { code: err.code, message: err.message, retryable: err.retryable, details: err.details };
  }
  return { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Unexpected error', retryable: false };
}

export interface LabRunControls {
  state: RunState;
  run: (request: ExecutionRequest) => Promise<RunState | undefined>;
  cancel: () => Promise<void>;
  /** Sends a decision for a pending approval; rejects with ApiClientError so the caller can show it inline. */
  decide: (approvalId: string, decision: ApprovalDecision) => Promise<void>;
  reset: () => void;
}

/** Starts a run, streams its events into reducer state, supports cancel; closes the stream on unmount. */
export function useLabRun(labId: string): LabRunControls {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const streamCtrl = useRef<AbortController | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => () => streamCtrl.current?.abort(), []);

  const run = useCallback(
    async (request: ExecutionRequest) => {
      streamCtrl.current?.abort();
      const ctrl = new AbortController();
      streamCtrl.current = ctrl;
      dispatch({ type: 'start' });
      let final: RunState = { ...initialRunState, phase: 'starting' };
      const apply = (action: Parameters<typeof runReducer>[1]) => {
        final = runReducer(final, action);
        dispatch(action);
      };
      try {
        const started = await startRun(labId, request, ctrl.signal);
        apply({ type: 'started', runId: started.runId, correlationId: started.correlationId });
        await streamRunEvents(started.runId, (event) => apply({ type: 'event', event }), ctrl.signal);
        return final;
      } catch (err) {
        if (ctrl.signal.aborted) return undefined;
        apply({ type: 'client-error', error: toRunError(err) });
        return final;
      }
    },
    [labId],
  );

  const cancel = useCallback(async () => {
    const runId = latest.current.runId;
    if (!runId || latest.current.phase === 'finished') return;
    try {
      await cancelRun(runId);
    } catch (err) {
      dispatch({ type: 'client-error', error: toRunError(err) });
    }
  }, []);

  const decide = useCallback(async (approvalId: string, decision: ApprovalDecision) => {
    const runId = latest.current.runId;
    if (!runId) return;
    // The UI updates from the approval-resolved event on the stream, not from this response.
    await decideApproval(runId, approvalId, decision);
  }, []);

  const reset = useCallback(() => {
    streamCtrl.current?.abort();
    dispatch({ type: 'reset' });
  }, []);

  return { state, run, cancel, decide, reset };
}
