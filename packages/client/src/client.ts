import type { ExecutionRequestSchema } from '@mlp/contracts';
import {
  ApprovalDecisionResponseSchema,
  CatalogSchema,
  ExecutionEventSchema,
  HealthResponseSchema,
  LabDefinitionSchema,
  LabSourceResponseSchema,
  LabSummaryListSchema,
  PreflightResultSchema,
  PROGRESS_SUBJECT_HEADER,
  ProgressEntrySchema,
  ProgressSnapshotSchema,
  ReadinessResponseSchema,
  RunSnapshotSchema,
  RecoverRunResponseSchema,
  RecentRunsResponseSchema,
  RUN_SUBJECT_HEADER,
  SessionResponseSchema,
  StartRunResponseSchema,
  type ApprovalDecision,
  type ExecutionEvent,
  type LoginRequest,
  type ProgressWriteRequest,
  type ProgressResetRequest,
  type ProgressImportRequest,
} from '@mlp/contracts';
import type { z } from 'zod';

/** What callers send to start a run (mode defaults to offline on the server). */
export type StartRunRequest = z.input<typeof ExecutionRequestSchema>;
import { ApiClientError, toApiClientError } from './errors.js';
import { SseParser } from './sse.js';
import {
  TutorSettingsSchema,
  TutorEventSchema,
  TutorRequestSchema,
  RUN_SUBJECT_HEADER as TUTOR_SUBJECT_HEADER,
  type TutorRequest,
  type TutorEvent,
} from '@mlp/contracts';

export interface ApiClientOptions {
  /** API origin, e.g. "http://127.0.0.1:8787". Default "": same origin as the page. */
  baseUrl?: string;
  /** Injected fetch (tests, server-side rendering). Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /** Event-stream reconnects after a drop. */
  reconnect?: { max?: number; baseDelayMs?: number };
  /** Called before each reconnect, with the last sequence number received. */
  onReconnect?: (attempt: number, lastSeq: number) => void;
}

const ALLOWED_OPTIONS = new Set(['baseUrl', 'fetch', 'reconnect', 'onReconnect']);
const enc = encodeURIComponent;

/**
 * Typed client for every API route. It holds no credentials: the browser's session cookie authenticates
 * requests, and the per-run token (returned by runs.start) authorizes cancel and approvals. Model and
 * provider keys stay on the server; passing any other option (for example apiKey) is refused.
 */
export function createApiClient(options: ApiClientOptions = {}) {
  for (const key of Object.keys(options))
    if (!ALLOWED_OPTIONS.has(key))
      throw new TypeError(`createApiClient: unsupported option "${key}". Credentials never belong in the browser client.`);
  const base = (options.baseUrl ?? '').replace(/\/$/, '');
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const maxReconnects = options.reconnect?.max ?? 3;
  const reconnectDelay = options.reconnect?.baseDelayMs ?? 300;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, { credentials: 'same-origin', ...init });
    } catch (err) {
      if (init.signal?.aborted) throw err;
      throw new ApiClientError('NETWORK', 'Cannot reach the API. Is it running?', 0, undefined, true);
    }
  }

  async function request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    opts: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal; acceptStatuses?: number[] } = {},
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await send(path, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: opts.signal,
    });
    if (!res.ok && !opts.acceptStatuses?.includes(res.status)) throw await toApiClientError(res);
    const body: unknown = await res.json().catch(() => undefined);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiClientError(
        'CONTRACT',
        `The API response for ${method} ${path} does not match its contract${issue ? ` (${issue.path.join('.') || 'body'}: ${issue.message})` : ''}`,
        res.status,
        parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return parsed.data;
  }

  /**
   * Streams a run's events until `complete`, reconnecting with Last-Event-ID after a drop (bounded).
   * Events are validated and delivered once each, in order. Aborting `signal` closes the stream.
   */
  async function events(runId: string, onEvent: (e: ExecutionEvent) => void, signal?: AbortSignal): Promise<void> {
    let lastSeq = -1;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        if (attempt > maxReconnects) throw new ApiClientError('NETWORK', 'Lost connection to the run stream', 0, undefined, true);
        options.onReconnect?.(attempt, lastSeq);
        await new Promise((r) => setTimeout(r, reconnectDelay * attempt));
      }
      let res: Response;
      try {
        res = await send(`/api/runs/${enc(runId)}/events`, {
          headers: { accept: 'text/event-stream', ...(lastSeq >= 0 ? { 'last-event-id': String(lastSeq) } : {}) },
          signal,
        });
      } catch (err) {
        if (signal?.aborted || !(err instanceof ApiClientError)) throw err;
        continue;
      }
      if (!res.ok) throw await toApiClientError(res);
      if (!res.body) throw new ApiClientError('INTERNAL', 'Streaming is not supported here', 0);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      const parser = new SseParser();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const frame of parser.push(value)) {
            let json: unknown;
            try {
              json = JSON.parse(frame.data);
            } catch {
              throw new ApiClientError('CONTRACT', 'Received an event that is not JSON', res.status);
            }
            const parsed = ExecutionEventSchema.safeParse(json);
            if (!parsed.success)
              throw new ApiClientError(
                'CONTRACT',
                `Received an event that does not match the contract (${parsed.error.issues[0]?.path.join('.') || 'event'})`,
                res.status,
              );
            if (parsed.data.seq <= lastSeq) continue; // already delivered before a reconnect
            lastSeq = parsed.data.seq;
            onEvent(parsed.data);
            if (parsed.data.type === 'complete') return;
          }
        }
      } catch (err) {
        if (signal?.aborted || err instanceof ApiClientError) throw err;
        // A dropped connection: reconnect below.
      } finally {
        reader.releaseLock();
      }
    }
  }

  /** Tutor requests are never replayed/retried automatically: a retry could incur another charge. */
  async function tutorAnswer(subject: string, body: TutorRequest, onEvent: (event: TutorEvent) => void, signal?: AbortSignal) {
    const input = TutorRequestSchema.parse(body);
    const res = await send('/api/tutor/answer', {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        [TUTOR_SUBJECT_HEADER]: enc(subject),
      },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok) throw await toApiClientError(res);
    if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream'))
      throw new ApiClientError('CONTRACT', 'Tutor did not return an event stream.', res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let seq = 0,
      requestId = '',
      bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal?.aborted) throw signal.reason;
        if (done)
          throw new ApiClientError(
            'NETWORK',
            'Tutor connection interrupted. Partial text is incomplete; retry explicitly.',
            0,
            undefined,
            true,
          );
        bytes += value.byteLength;
        if (bytes > 16 * 1024 * 1024) throw new ApiClientError('CONTRACT', 'Tutor stream exceeded its size limit.', 0);
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          if (signal?.aborted) throw signal.reason;
          let raw: unknown;
          try {
            raw = JSON.parse(frame.data);
          } catch {
            throw new ApiClientError('CONTRACT', 'Invalid tutor stream JSON.', 0);
          }
          const parsed = TutorEventSchema.safeParse(raw);
          if (!parsed.success || parsed.data.seq !== seq || seq > 512)
            throw new ApiClientError('CONTRACT', 'Invalid tutor stream event or sequence.', 0);
          const event = parsed.data;
          if (seq === 0) {
            if (
              event.type !== 'started' ||
              event.labId !== input.labId ||
              event.mode !== input.mode ||
              event.simulated !== (input.mode === 'offline') ||
              event.modelId !== (input.mode === 'live' ? input.modelId : null)
            )
              throw new ApiClientError('CONTRACT', 'Tutor response does not match this request.', 0);
            requestId = event.requestId;
          } else if (event.type === 'started' || event.requestId !== requestId) {
            throw new ApiClientError('CONTRACT', 'Tutor response identity changed.', 0);
          }
          seq++;
          onEvent(event);
          if (event.type === 'complete' || event.type === 'error') return;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  return {
    tutor: {
      settings: (signal?: AbortSignal) => request('GET', '/api/tutor/settings', TutorSettingsSchema, { signal }),
      answer: tutorAnswer,
    },
    health: (signal?: AbortSignal) => request('GET', '/api/health', HealthResponseSchema, { signal }),
    /** Readiness (L72): a 503 "not-ready" answer is returned as data, with the failing checks. */
    ready: (signal?: AbortSignal) => request('GET', '/api/ready', ReadinessResponseSchema, { signal, acceptStatuses: [503] }),
    catalog: (signal?: AbortSignal) => request('GET', '/api/catalog', CatalogSchema, { signal }),
    auth: {
      localSession: (signal?: AbortSignal) =>
        request('POST', '/api/auth/local-session', SessionResponseSchema, { body: {}, signal }),
      session: (signal?: AbortSignal) => request('GET', '/api/auth/session', SessionResponseSchema, { signal }),
      login: (body: LoginRequest) => request('POST', '/api/auth/login', SessionResponseSchema, { body }),
      logout: () => request('POST', '/api/auth/logout', SessionResponseSchema, { body: {} }),
    },
    progress: {
      get: (subject: string, signal?: AbortSignal) =>
        request('GET', '/api/progress', ProgressSnapshotSchema, { headers: { [PROGRESS_SUBJECT_HEADER]: enc(subject) }, signal }),
      save: (subject: string, labId: string, body: ProgressWriteRequest, signal?: AbortSignal) =>
        request('POST', `/api/progress/${enc(labId)}`, ProgressEntrySchema, {
          body,
          headers: { [PROGRESS_SUBJECT_HEADER]: enc(subject) },
          signal,
        }),
      reset: (subject: string, labId: string, body: ProgressResetRequest, signal?: AbortSignal) =>
        request('POST', `/api/progress/${enc(labId)}/reset`, ProgressEntrySchema, {
          body,
          headers: { [PROGRESS_SUBJECT_HEADER]: enc(subject) },
          signal,
        }),
      import: (subject: string, body: ProgressImportRequest, signal?: AbortSignal) =>
        request('POST', '/api/progress/import', ProgressSnapshotSchema, {
          body,
          headers: { [PROGRESS_SUBJECT_HEADER]: enc(subject) },
          signal,
        }),
    },
    labs: {
      list: (signal?: AbortSignal) => request('GET', '/api/labs', LabSummaryListSchema, { signal }),
      get: (labId: string, signal?: AbortSignal) => request('GET', `/api/labs/${enc(labId)}`, LabDefinitionSchema, { signal }),
      source: (labId: string, signal?: AbortSignal) =>
        request('GET', `/api/labs/${enc(labId)}/source`, LabSourceResponseSchema, { signal }),
      preflight: (labId: string, signal?: AbortSignal) =>
        request('GET', `/api/labs/${enc(labId)}/preflight`, PreflightResultSchema, { signal }),
    },
    runs: {
      recent: (labId: string, subject: string, signal?: AbortSignal) =>
        request('GET', `/api/runs?labId=${enc(labId)}`, RecentRunsResponseSchema, {
          headers: { [RUN_SUBJECT_HEADER]: enc(subject) },
          signal,
        }),
      recover: (runId: string, subject: string, signal?: AbortSignal) =>
        request('POST', `/api/runs/${enc(runId)}/recover`, RecoverRunResponseSchema, {
          headers: { [RUN_SUBJECT_HEADER]: enc(subject) },
          signal,
        }),
      start: (labId: string, body: StartRunRequest, signal?: AbortSignal) =>
        request('POST', `/api/labs/${enc(labId)}/runs`, StartRunResponseSchema, { body, signal }),
      get: (runId: string, signal?: AbortSignal) => request('GET', `/api/runs/${enc(runId)}`, RunSnapshotSchema, { signal }),
      /** The run token (from start) proves this client started the run; cancel and approvals require it. */
      cancel: (runId: string, runToken: string) =>
        request('POST', `/api/runs/${enc(runId)}/cancel`, RunSnapshotSchema, { headers: { 'x-run-token': runToken } }),
      decide: (runId: string, runToken: string, approvalId: string, decision: ApprovalDecision, reason?: string) =>
        request('POST', `/api/runs/${enc(runId)}/approvals/${enc(approvalId)}`, ApprovalDecisionResponseSchema, {
          body: { decision, ...(reason ? { reason } : {}) },
          headers: { 'x-run-token': runToken },
        }),
      events,
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
