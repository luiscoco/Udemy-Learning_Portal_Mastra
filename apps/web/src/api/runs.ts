import {
  ExecutionEventSchema,
  LabSourceResponseSchema,
  PreflightResultSchema,
  RunSnapshotSchema,
  StartRunResponseSchema,
  type ExecutionEvent,
  type ExecutionRequest,
  type LabSourceResponse,
  type PreflightResult,
  type RunSnapshot,
  type StartRunResponse,
} from '@mlp/contracts';
import { SseParser } from '../lib/sse';
import { ApiClientError, getJson, toApiClientError } from './client';

export async function startRun(labId: string, body: ExecutionRequest, signal?: AbortSignal): Promise<StartRunResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/labs/${encodeURIComponent(labId)}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiClientError('NETWORK', 'Cannot reach the API. Is `npm run dev` running?', 0, undefined, true);
  }
  if (!res.ok) throw await toApiClientError(res);
  return StartRunResponseSchema.parse(await res.json());
}

export async function cancelRun(runId: string): Promise<RunSnapshot> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
  if (!res.ok) throw await toApiClientError(res);
  return RunSnapshotSchema.parse(await res.json());
}

export async function fetchSource(labId: string, signal?: AbortSignal): Promise<LabSourceResponse> {
  return LabSourceResponseSchema.parse(await getJson(`/api/labs/${encodeURIComponent(labId)}/source`, signal));
}

export async function fetchPreflight(labId: string, signal?: AbortSignal): Promise<PreflightResult> {
  return PreflightResultSchema.parse(await getJson(`/api/labs/${encodeURIComponent(labId)}/preflight`, signal));
}

const MAX_RECONNECTS = 3;

/**
 * Streams run events until `complete`. Reconnects with Last-Event-ID on network drops.
 * Aborting `signal` closes the connection (the server cancels the run after its grace period).
 */
export async function streamRunEvents(
  runId: string,
  onEvent: (event: ExecutionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let lastSeq = -1;
  let attempts = 0;
  for (;;) {
    let completed = false;
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/events`, {
        headers: { accept: 'text/event-stream', ...(lastSeq >= 0 ? { 'last-event-id': String(lastSeq) } : {}) },
        signal,
      });
      if (!res.ok) throw await toApiClientError(res);
      if (!res.body) throw new ApiClientError('INTERNAL', 'Streaming is not supported by this browser', 0);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      const parser = new SseParser();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const frame of parser.push(value)) {
          const parsed = ExecutionEventSchema.safeParse(JSON.parse(frame.data));
          if (!parsed.success) throw new ApiClientError('INTERNAL', 'Received a malformed event from the server', 0);
          lastSeq = parsed.data.seq;
          onEvent(parsed.data);
          if (parsed.data.type === 'complete') completed = true;
        }
      }
      if (completed) return;
    } catch (err) {
      if (signal.aborted) throw err;
      if (err instanceof ApiClientError && err.code !== 'NETWORK' && err.status !== 0) throw err;
      if (err instanceof ApiClientError && err.message.startsWith('Received a malformed')) throw err;
      if (err instanceof SyntaxError) throw new ApiClientError('INTERNAL', 'Received a malformed event from the server', 0);
    }
    if (++attempts > MAX_RECONNECTS) {
      throw new ApiClientError('NETWORK', 'Lost connection to the run stream', 0, undefined, true);
    }
    await new Promise((r) => setTimeout(r, 300 * attempts));
  }
}
