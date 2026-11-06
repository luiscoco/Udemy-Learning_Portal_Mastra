import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { z } from 'zod';
import { ApiClientError, createApiClient } from '@mlp/client';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { lab66Definition } from './definition.js';
import { DRIFTS, startDemoApi, type RequestRecord } from './server.js';

export const Lab66InputSchema = z.object({
  message: z.string().trim().min(1).max(200),
  delayMs: z.number().int().min(0).max(1_000),
  dropAfterEvents: z.number().int().min(0).max(6),
  drift: z.enum(DRIFTS),
  cancelAfterMs: z.number().int().min(0).max(2_000),
});
export type Lab66Input = z.infer<typeof Lab66InputSchema>;

export interface SdkCall {
  method: string;
  outcome: 'ok' | 'error';
  status?: number;
  code?: string;
  detail?: string;
  ms: number;
}

export interface Lab66Output {
  calls: SdkCall[];
  events: { seq: number; type: string }[];
  reconnects: { attempt: number; lastSeq: number }[];
  streamConnections: number;
  rendered: { status: string | null; text: string | null };
  credentialScan: { requests: number; credentialHeaders: string[]; secretLikeValues: number; keyOptionRefused: boolean };
  requests: RequestRecord[];
  drift: Lab66Input['drift'];
  resources: { closed: boolean; openSockets: number };
}

const baseLab66: LabImplementation<Lab66Input, Lab66Output, LabServices> = {
  definition: lab66Definition as LabDefinition,
  inputSchema: Lab66InputSchema,

  async run(ctx, input) {
    // 1. The SDK refuses credentials outright (the value below is an invented sample, never sent anywhere).
    let keyOptionRefused = false;
    try {
      createApiClient({ apiKey: 'sk-demo-invented-not-a-key' } as never);
    } catch {
      keyOptionRefused = true;
    }

    const server = await startDemoApi({ drift: input.drift, dropAfterEvents: input.dropAfterEvents, signal: ctx.signal });
    const calls: SdkCall[] = [];
    const reconnects: Lab66Output['reconnects'] = [];
    const events: Lab66Output['events'] = [];
    let rendered: Lab66Output['rendered'] = { status: null, text: null };
    let resources: Lab66Output['resources'];
    const sdk = createApiClient({
      baseUrl: server.base,
      reconnect: { max: 3, baseDelayMs: 50 },
      onReconnect: (attempt, lastSeq) => {
        reconnects.push({ attempt, lastSeq });
        ctx.log('warn', `stream dropped: reconnect ${attempt} with Last-Event-ID ${lastSeq}`);
      },
    });
    /** Runs one SDK call and records it as a typed result or a typed error. */
    async function track<T>(method: string, call: () => Promise<T>): Promise<T | undefined> {
      ctx.emit({ type: 'workflow-step', stepId: method, status: 'running' });
      const t0 = Date.now();
      try {
        const value = await call();
        calls.push({ method, outcome: 'ok', ms: Date.now() - t0 });
        ctx.emit({ type: 'workflow-step', stepId: method, status: 'success', durationMs: Date.now() - t0 });
        return value;
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        const e = err instanceof ApiClientError ? err : new ApiClientError('INTERNAL', String(err), 0);
        calls.push({
          method,
          outcome: 'error',
          status: e.status,
          code: e.code,
          detail: e.details?.[0]?.path ?? e.message.slice(0, 160),
          ms: Date.now() - t0,
        });
        ctx.emit({
          type: 'workflow-step',
          stepId: method,
          status: 'failed',
          durationMs: Date.now() - t0,
          output: { code: e.code },
        });
        return undefined;
      }
    }

    try {
      await track('labs.get', () => sdk.labs.get('lab-00', ctx.signal));
      const started = await track('runs.start', () =>
        sdk.runs.start(
          'lab-00',
          { input: { message: input.message, delayMs: input.delayMs, simulateFailure: false } },
          ctx.signal,
        ),
      );
      if (started) {
        const cancelTimer =
          input.cancelAfterMs > 0
            ? setTimeout(
                () => void track('runs.cancel', () => sdk.runs.cancel(started.runId, started.runToken)),
                input.cancelAfterMs,
              )
            : undefined;
        await track('runs.events', () =>
          sdk.runs.events(
            started.runId,
            (e) => {
              events.push({ seq: e.seq, type: e.type });
              if (e.type === 'result') rendered = { ...rendered, text: String((e.output as { echo?: unknown })?.echo ?? '') };
            },
            ctx.signal,
          ),
        );
        clearTimeout(cancelTimer);
        // Wait for a cancel that is still in flight, so its call is recorded.
        for (let i = 0; i < 40 && input.cancelAfterMs > 0 && !calls.some((c) => c.method === 'runs.cancel'); i++)
          await new Promise((r) => setTimeout(r, 50));
        const snap = await track('runs.get', () => sdk.runs.get(started.runId, ctx.signal));
        rendered = { ...rendered, status: snap?.status ?? null };
      }
      // Deliberate mistakes: the SDK turns them into typed errors the UI can explain.
      await track('runs.start (empty message)', () => sdk.runs.start('lab-00', { input: { message: '' } }, ctx.signal));
      await track('labs.get (unknown lab)', () => sdk.labs.get('lab-42', ctx.signal));
    } finally {
      resources = await server.close();
    }

    return {
      calls,
      events,
      reconnects,
      streamConnections: server.streams,
      rendered,
      credentialScan: {
        requests: server.requests.length,
        credentialHeaders: [...new Set(server.requests.flatMap((r) => r.credentialHeaders))],
        secretLikeValues: server.requests.reduce((n, r) => n + r.secretLikeValues, 0),
        keyOptionRefused,
      },
      requests: server.requests,
      drift: input.drift,
      resources,
    };
  },

  validate(out, input) {
    const byMethod = (m: string) => out.calls.find((c) => c.method === m);
    const seqs = out.events.map((e) => e.seq);
    const contiguous = seqs.every((s, i) => s === i);
    const contractErrors = out.calls.filter((c) => c.code === 'CONTRACT').map((c) => c.method);
    const expectedContract = input.drift === 'snapshot' ? 'runs.get' : input.drift === 'event' ? 'runs.events' : null;
    const finished = out.events.at(-1)?.type === 'complete';
    return summarizeChecks([
      {
        id: 'responses-validated',
        label: 'Every SDK call returned contract-valid data or a typed error',
        passed: out.calls.length > 0 && out.calls.every((c) => c.outcome === 'ok' || Boolean(c.code)),
        message: out.calls.map((c) => `${c.method}: ${c.outcome === 'ok' ? 'ok' : `${c.status} ${c.code}`}`).join('; '),
      },
      {
        id: 'stream-resumed',
        label: 'A dropped stream resumed with Last-Event-ID, without missing or repeating events',
        // A drop happened when the server saw a second stream connection; it must be a Last-Event-ID resume.
        passed:
          contiguous &&
          (out.streamConnections < 2 || (out.reconnects.length >= 1 && out.requests.some((r) => r.lastEventId !== undefined))) &&
          (input.dropAfterEvents === 0 ||
            input.drift === 'event' ||
            out.streamConnections >= 2 ||
            (finished && seqs.length <= input.dropAfterEvents)),
        message:
          input.dropAfterEvents === 0
            ? `${seqs.length} events in one connection`
            : `${out.streamConnections} connection(s), ${out.reconnects.length} reconnect(s), seq ${seqs[0] ?? '-'}…${seqs.at(-1) ?? '-'}`,
      },
      {
        id: 'drift-rejected',
        label: 'A response that drifted from the contract became a CONTRACT error, never data',
        passed: expectedContract === null ? contractErrors.length === 0 : contractErrors.includes(expectedContract),
        message: expectedContract === null ? 'no drift injected' : `CONTRACT raised by ${contractErrors.join(', ') || 'nothing'}`,
      },
      {
        id: 'errors-typed',
        label: 'Bad requests came back as typed errors with codes and details',
        passed:
          byMethod('runs.start (empty message)')?.code === 'VALIDATION_FAILED' &&
          Boolean(byMethod('runs.start (empty message)')?.detail) &&
          byMethod('labs.get (unknown lab)')?.code === 'NOT_FOUND',
        message: `empty message → ${byMethod('runs.start (empty message)')?.code}; unknown lab → ${byMethod('labs.get (unknown lab)')?.code}`,
      },
      {
        id: 'no-browser-credentials',
        label: 'No request carried credentials, and the SDK refused an apiKey option',
        passed:
          out.credentialScan.keyOptionRefused &&
          out.credentialScan.credentialHeaders.length === 0 &&
          out.credentialScan.secretLikeValues === 0,
        message: `${out.credentialScan.requests} requests scanned; credential headers: ${out.credentialScan.credentialHeaders.join(', ') || 'none'}`,
      },
      {
        id: 'cancel-honoured',
        label: 'Cancel with the run token ended the run as cancelled',
        passed:
          input.cancelAfterMs === 0 ||
          out.rendered.status === 'succeeded' ||
          (byMethod('runs.cancel')?.outcome === 'ok' && out.rendered.status === 'cancelled') ||
          input.drift === 'snapshot',
        message: input.cancelAfterMs === 0 ? 'no cancel requested' : `final status ${out.rendered.status ?? 'unknown'}`,
      },
      {
        id: 'resources-released',
        label: 'The loopback API closed with no open sockets',
        passed: out.resources.closed && out.resources.openSockets === 0,
        message: `closed: ${out.resources.closed}, open sockets: ${out.resources.openSockets}`,
      },
    ]);
  },
};

export const lab66 = withLiveCheckpoint(baseLab66);
