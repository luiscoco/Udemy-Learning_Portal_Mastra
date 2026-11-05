import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClientError } from '@mlp/client';
import type { ExecutionEvent, ExecutionEventPayload, RunSnapshot } from '@mlp/contracts';
import * as http from '../../api/runs';
import { useLabRun } from './useLabRun';
import { pendingApprovals } from './run-state';
import { runPointerKey } from './run-pointer';

vi.mock('../../api/runs', () => ({
  startRun: vi.fn(),
  streamRunEvents: vi.fn(),
  recoverRun: vi.fn(),
  fetchRecentRuns: vi.fn(),
  cancelRun: vi.fn(),
  decideApproval: vi.fn(),
}));
const subject = 'dev:alice',
  id = 'saved-run';
const snapshot = (status: RunSnapshot['status'] = 'succeeded'): RunSnapshot => ({
  runId: id,
  labId: 'lab-00',
  correlationId: 'correlation',
  status,
  mode: 'offline',
  startedAt: '2026-01-01T00:00:00.000Z',
  ...(status === 'running' ? {} : { finishedAt: '2026-01-01T00:00:01.000Z' }),
  deadlineMs: 2000,
  eventCount: status === 'running' ? 1 : 3,
  pendingApprovals: status === 'running' ? 1 : 0,
});
const event = (seq: number, payload: ExecutionEventPayload) =>
  ({ ...payload, seq, runId: id, correlationId: 'correlation', timestamp: '2026-01-01T00:00:01.000Z' }) as ExecutionEvent;
const completed = [
  event(0, { type: 'token', text: 'one' }),
  event(1, { type: 'result', output: { answer: 'one' }, validation: { passed: true, checks: [] } }),
  event(2, { type: 'complete', status: 'succeeded', durationMs: 1000 }),
];
function terminalMocks() {
  vi.mocked(http.recoverRun).mockResolvedValue({ snapshot: snapshot(), runToken: 'private-recovery-capability-value' });
  vi.mocked(http.streamRunEvents).mockImplementation(async (_id, callback) => {
    completed.forEach(callback);
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  terminalMocks();
});
it('remembers only the run ID when starting new work, never the capability or input body', async () => {
  vi.mocked(http.startRun).mockResolvedValue({
    runId: id,
    correlationId: 'correlation',
    requestId: 'request',
    runToken: 'private-original-start-capability',
  });
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await act(async () => {
    await view.result.current.run({ input: { message: 'private-input-not-for-storage' }, mode: 'offline' });
  });
  expect(sessionStorage.getItem(runPointerKey(subject, 'lab-00'))).toBe(id);
  const storage = JSON.stringify({ ...sessionStorage });
  expect(storage).not.toContain('private-original-start-capability');
  expect(storage).not.toContain('private-input-not-for-storage');
  expect(http.recoverRun).not.toHaveBeenCalled();
  view.unmount();
});
afterEach(() => vi.restoreAllMocks());

it('reattaches historical output with deduplicated events and stores only an account-scoped ID', async () => {
  sessionStorage.setItem(runPointerKey(subject, 'lab-00'), id);
  vi.mocked(http.streamRunEvents).mockImplementation(async (_id, callback) => {
    callback(completed[0]!);
    completed.forEach(callback);
  });
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await waitFor(() => expect(view.result.current.state.phase).toBe('finished'));
  expect(view.result.current.state.tokenText).toBe('one');
  expect(view.result.current.state.historical).toBe(true);
  expect(view.result.current.state.tokenCount).toBe(1);
  expect(sessionStorage.getItem(runPointerKey(subject, 'lab-00'))).toBe(id);
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('private-recovery-capability-value');
  expect(http.startRun).not.toHaveBeenCalled();
  view.unmount();
});

it('restores live approval/cancel controls using a recovered in-memory capability', async () => {
  sessionStorage.setItem(runPointerKey(subject, 'lab-00'), id);
  vi.mocked(http.recoverRun).mockResolvedValue({ snapshot: snapshot('running'), runToken: 'private-live-recovery-capability' });
  let emit!: (e: ExecutionEvent) => void, finish!: () => void;
  vi.mocked(http.streamRunEvents).mockImplementation((_id, callback) => {
    emit = callback;
    callback(
      event(0, {
        type: 'approval-request',
        approvalId: 'a1',
        toolName: 'write',
        args: {},
        message: 'Approve?',
        expiresAt: '2026-01-01T00:05:00.000Z',
      }),
    );
    return new Promise<void>((done) => {
      finish = done;
    });
  });
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await waitFor(() => expect(view.result.current.state.phase).toBe('streaming'));
  expect(pendingApprovals(view.result.current.state)).toHaveLength(1);
  expect(view.result.current.state.historical).toBe(false);
  expect(view.result.current.recoveryMessage).toContain('Reattached');
  await act(async () => {
    await view.result.current.decide('a1', 'approve');
  });
  expect(http.decideApproval).toHaveBeenCalledWith(id, 'private-live-recovery-capability', 'a1', 'approve');
  vi.mocked(http.cancelRun).mockImplementation(async () => {
    emit(event(1, { type: 'complete', status: 'cancelled', durationMs: 1000 }));
    finish();
    return snapshot('cancelled');
  });
  await act(async () => {
    await view.result.current.cancel();
  });
  expect(http.cancelRun).toHaveBeenCalledWith(id, 'private-live-recovery-capability');
  expect(pendingApprovals(view.result.current.state)).toEqual([]);
  view.unmount();
});

it('does not show a previous account or apply its delayed recovery response to the new account', async () => {
  sessionStorage.setItem(runPointerKey(subject, 'lab-00'), id);
  let resolve!: (value: Awaited<ReturnType<typeof http.recoverRun>>) => void;
  vi.mocked(http.recoverRun).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = renderHook(({ account }) => useLabRun('lab-00', { subject: account }), { initialProps: { account: subject } });
  await waitFor(() => expect(http.recoverRun).toHaveBeenCalled());
  view.rerender({ account: 'dev:bob' });
  expect(view.result.current.state.runId).toBeUndefined();
  await act(async () => {
    resolve({ snapshot: snapshot(), runToken: 'private-alice-capability' });
  });
  expect(view.result.current.state.runId).toBeUndefined();
  expect(http.streamRunEvents).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(runPointerKey('dev:bob', 'lab-00'))).toBeNull();
  view.unmount();
});

it('reset clears only the pointer and rejects a late recovery result', async () => {
  sessionStorage.setItem(runPointerKey(subject, 'lab-00'), id);
  let resolve!: (value: Awaited<ReturnType<typeof http.recoverRun>>) => void;
  vi.mocked(http.recoverRun).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await waitFor(() => expect(http.recoverRun).toHaveBeenCalled());
  act(() => view.result.current.reset());
  await act(async () => {
    resolve({ snapshot: snapshot(), runToken: 'late-private-capability' });
  });
  expect(view.result.current.state.phase).toBe('idle');
  expect(sessionStorage.getItem(runPointerKey(subject, 'lab-00'))).toBeNull();
  expect(http.startRun).not.toHaveBeenCalled();
  expect(http.streamRunEvents).not.toHaveBeenCalled();
  view.unmount();
});

it('can recover latest work when storage is unavailable, without storing credentials', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.mocked(http.fetchRecentRuns).mockResolvedValue({ runs: [snapshot()] });
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await waitFor(() => expect(view.result.current.recoveryMessage).toContain('cannot remember'));
  await act(async () => {
    await view.result.current.recoverLatest();
  });
  expect(view.result.current.state.terminal).toBe('succeeded');
  expect(http.startRun).not.toHaveBeenCalled();
  view.unmount();
});

it('surfaces missing retained records and clears stale pointers without starting new work', async () => {
  sessionStorage.setItem(runPointerKey(subject, 'lab-00'), id);
  vi.mocked(http.recoverRun).mockRejectedValue(new ApiClientError('NOT_FOUND', 'Run is no longer retained.', 404));
  const view = renderHook(() => useLabRun('lab-00', { subject }));
  await waitFor(() => expect(view.result.current.state.error?.code).toBe('NOT_FOUND'));
  expect(sessionStorage.getItem(runPointerKey(subject, 'lab-00'))).toBeNull();
  expect(http.startRun).not.toHaveBeenCalled();
  view.unmount();
});
