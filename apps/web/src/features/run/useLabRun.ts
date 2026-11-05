import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ApprovalDecision, ExecutionRequest } from '@mlp/contracts';
import { ApiClientError } from '../../api/client';
import { cancelRun, decideApproval, fetchRecentRuns, recoverRun, startRun, streamRunEvents } from '../../api/runs';
import { initialRunState, runReducer, type RunAction, type RunState } from './run-state';
import { readRunPointer, rememberRun } from './run-pointer';

function toRunError(err: unknown) {
  if (err instanceof ApiClientError)
    return { code: err.code, message: err.message, retryable: err.retryable, details: err.details };
  return { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Unexpected error', retryable: false };
}
const NO_STORAGE = 'This browser cannot remember the execution. Use Recover latest run to restore it.';

export interface LabRunControls {
  state: RunState;
  run: (request: ExecutionRequest) => Promise<RunState | undefined>;
  cancel: () => Promise<void>;
  decide: (approvalId: string, decision: ApprovalDecision) => Promise<void>;
  reset: () => void;
  recoverLatest: () => Promise<void>;
  recoveryMessage: string | null;
}

/** Specialized chat/workspace controllers omit recovery options and retain their existing history flow. */
export function useLabRun(labId: string, recovery?: { subject: string | null }): LabRunControls {
  const enabled = recovery !== undefined,
    subject = recovery?.subject ?? null;
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const [executionOwner, setExecutionOwner] = useState(subject);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const visibleState = enabled && executionOwner !== subject ? initialRunState : state;
  const streamCtrl = useRef<AbortController | null>(null),
    generation = useRef(0);
  const latest = useRef(visibleState);
  // Capabilities remain in memory only, including capabilities issued during recovery.
  const token = useRef<{ runId: string; runToken: string } | null>(null);
  const invalidateJob = useCallback(() => {
    ++generation.current;
    streamCtrl.current?.abort();
    token.current = null;
  }, []);
  useEffect(() => {
    latest.current = visibleState;
  }, [visibleState]);

  const remember = useCallback(
    (id: string | null) => !enabled || !subject || rememberRun(subject, labId, id),
    [enabled, subject, labId],
  );
  const begin = useCallback(() => {
    streamCtrl.current?.abort();
    const ctrl = new AbortController();
    streamCtrl.current = ctrl;
    const ownGeneration = ++generation.current;
    token.current = null;
    setExecutionOwner(subject);
    setRecoveryMessage(null);
    let final: RunState = { ...initialRunState, phase: 'starting' };
    latest.current = final;
    dispatch({ type: 'start' });
    const valid = () => !ctrl.signal.aborted && generation.current === ownGeneration;
    return {
      ctrl,
      valid,
      result: () => final,
      apply(action: RunAction) {
        if (!valid()) return;
        final = runReducer(final, action);
        latest.current = final;
        dispatch(action);
      },
    };
  }, [subject]);

  const run = useCallback(
    async (request: ExecutionRequest) => {
      const job = begin();
      try {
        const started = await startRun(labId, request, job.ctrl.signal);
        if (!job.valid()) return;
        token.current = { runId: started.runId, runToken: started.runToken };
        if (!remember(started.runId)) setRecoveryMessage(NO_STORAGE);
        job.apply({ type: 'started', runId: started.runId, correlationId: started.correlationId });
        await streamRunEvents(started.runId, (event) => job.apply({ type: 'event', event }), job.ctrl.signal);
        return job.valid() ? job.result() : undefined;
      } catch (err) {
        if (!job.valid()) return;
        job.apply({ type: 'client-error', error: toRunError(err) });
        return job.result();
      }
    },
    [begin, labId, remember],
  );

  const restore = useCallback(
    async (runId: string) => {
      if (!enabled || !subject) return;
      const job = begin();
      setRecoveryMessage('Restoring saved execution…');
      try {
        const recovered = await recoverRun(runId, subject, job.ctrl.signal);
        if (!job.valid()) return;
        if (recovered.snapshot.labId !== labId)
          throw new ApiClientError('CONTRACT', 'Saved execution belongs to another lab.', 0);
        token.current = { runId, runToken: recovered.runToken };
        const durablePointer = remember(runId);
        job.apply({
          type: 'restoring',
          runId,
          correlationId: recovered.snapshot.correlationId,
          historical: recovered.snapshot.status !== 'running',
        });
        if (recovered.snapshot.eventCount === 0 && recovered.snapshot.status === 'running') {
          job.apply({ type: 'started', runId, correlationId: recovered.snapshot.correlationId });
          setRecoveryMessage(durablePointer ? 'Reattached to live execution.' : NO_STORAGE);
        }
        await streamRunEvents(
          runId,
          (event) => {
            if (!job.valid()) return;
            job.apply({ type: 'event', event });
            if (
              job.result().phase === 'starting' &&
              recovered.snapshot.status === 'running' &&
              event.seq >= recovered.snapshot.eventCount - 1
            ) {
              job.apply({ type: 'started', runId, correlationId: recovered.snapshot.correlationId });
              setRecoveryMessage(durablePointer ? 'Reattached to live execution.' : NO_STORAGE);
            }
          },
          job.ctrl.signal,
        );
        if (job.valid())
          setRecoveryMessage(durablePointer ? 'Recovered previous execution. Review inputs before running again.' : NO_STORAGE);
      } catch (err) {
        if (!job.valid()) return;
        if (err instanceof ApiClientError && err.status === 404) remember(null);
        setRecoveryMessage(null);
        job.apply({ type: 'client-error', error: toRunError(err) });
      }
    },
    [enabled, subject, begin, labId, remember],
  );

  useEffect(() => {
    const baseline = ++generation.current;
    streamCtrl.current?.abort();
    token.current = null;
    const timer = enabled
      ? setTimeout(() => {
          if (generation.current !== baseline) return;
          setExecutionOwner(subject);
          dispatch({ type: 'reset' });
          latest.current = initialRunState;
          if (!subject) {
            setRecoveryMessage(null);
            return;
          }
          const pointer = readRunPointer(subject, labId);
          if (!pointer.available) setRecoveryMessage(NO_STORAGE);
          else if (pointer.runId) void restore(pointer.runId);
          else setRecoveryMessage(null);
        }, 0)
      : undefined;
    return () => {
      clearTimeout(timer);
      invalidateJob();
    };
  }, [enabled, subject, labId, restore, invalidateJob]);

  const recoverLatest = useCallback(async () => {
    if (!enabled || !subject) return;
    const job = begin();
    setRecoveryMessage('Looking for a saved execution…');
    try {
      const recent = await fetchRecentRuns(labId, subject, job.ctrl.signal);
      if (!job.valid()) return;
      const found = recent.runs[0];
      if (found) await restore(found.runId);
      else {
        remember(null);
        job.apply({ type: 'reset' });
        setRecoveryMessage('No retained execution is available for this lab.');
      }
    } catch (err) {
      if (job.valid()) {
        setRecoveryMessage(null);
        job.apply({ type: 'client-error', error: toRunError(err) });
      }
    }
  }, [enabled, subject, begin, labId, restore, remember]);

  const cancel = useCallback(async () => {
    const runId = latest.current.runId,
      ownGeneration = generation.current;
    if (!runId || latest.current.phase === 'finished') return;
    try {
      await cancelRun(runId, token.current?.runId === runId ? token.current.runToken : '');
    } catch (err) {
      if (generation.current === ownGeneration) dispatch({ type: 'client-error', error: toRunError(err) });
    }
  }, []);
  const decide = useCallback(async (approvalId: string, decision: ApprovalDecision) => {
    const runId = latest.current.runId;
    if (!runId || latest.current.phase !== 'streaming') return;
    await decideApproval(runId, token.current?.runId === runId ? token.current.runToken : '', approvalId, decision);
  }, []);
  const reset = useCallback(() => {
    ++generation.current;
    streamCtrl.current?.abort();
    token.current = null;
    latest.current = initialRunState;
    dispatch({ type: 'reset' });
    setExecutionOwner(subject);
    setRecoveryMessage(remember(null) ? null : NO_STORAGE);
  }, [remember, subject]);
  return {
    state: visibleState,
    run,
    cancel,
    decide,
    reset,
    recoverLatest,
    recoveryMessage: enabled && executionOwner !== subject ? null : recoveryMessage,
  };
}
