import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTranscript, ExecutionEventPayload } from '@mlp/contracts';
import { lab00Definition } from '../../../packages/labs/src/lab-00/definition';
import { jsonResponse, renderApp, signedInSession } from './test-utils';

// A chat lab definition as the API would serve it (the shape is validated by the SDK).
const DEF = { ...lab00Definition, id: 'lab-67', number: 67, title: 'Streaming chat UI', presentation: 'chat' };
const enc = new TextEncoder();
const frame = (runId: string, seq: number, p: ExecutionEventPayload) =>
  enc.encode(
    `id: ${seq}\ndata: ${JSON.stringify({ ...p, runId, correlationId: 'c', seq, timestamp: new Date(0).toISOString() })}\n\n`,
  );

const transcript = (messages: ChatTranscript['messages'], turn?: ChatTranscript['turn']): ChatTranscript => ({
  threadId: 'chat-1',
  threads: [{ id: 'chat-1', title: 'Hi', updatedAt: new Date(0).toISOString() }],
  messages,
  ...(turn ? { turn } : {}),
});
const msg = (id: string, role: 'user' | 'assistant', text: string, status: 'complete' | 'stopped' | 'failed' = 'complete') => ({
  id,
  role,
  text,
  status,
  createdAt: new Date(0).toISOString(),
});

type Script = (runId: string, ctrl: ReadableStreamDefaultController<Uint8Array>) => void;
let scripts: Script[];
let bodies: Record<string, unknown>[];
let cancels: { runId: string; token: string | null }[];
let streams: Map<string, ReadableStreamDefaultController<Uint8Array>>;
let finishCancellation: (() => void) | undefined;

/** A completed run whose result carries a transcript. */
const finished =
  (chat: ChatTranscript, extra: ExecutionEventPayload[] = []): Script =>
  (runId, ctrl) => {
    let seq = 0;
    for (const e of extra) ctrl.enqueue(frame(runId, seq++, e));
    ctrl.enqueue(
      frame(runId, seq++, { type: 'result', output: { action: 'send', chat }, validation: { passed: true, checks: [] } }),
    );
    ctrl.enqueue(frame(runId, seq, { type: 'complete', status: 'succeeded', durationMs: 5 }));
    ctrl.close();
  };

beforeEach(() => {
  localStorage.clear();
  scripts = [];
  bodies = [];
  cancels = [];
  streams = new Map();
  finishCancellation = undefined;
  let n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/session') return jsonResponse(signedInSession);
      if (url === '/api/labs/lab-67') return jsonResponse(DEF);
      if (url === '/api/labs/lab-67/preflight') return jsonResponse({ labId: 'lab-67', ready: true, checks: [] });
      if (url === '/api/labs/lab-67/runs') {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        n += 1;
        return jsonResponse(
          { runId: `run-${n}`, correlationId: 'c', requestId: 'r', runToken: `tok-${n}-0123456789abcdef` },
          202,
        );
      }
      const ev = /^\/api\/runs\/(run-\d+)\/events$/.exec(url);
      if (ev) {
        const runId = ev[1]!;
        const script = scripts.shift() ?? finished(transcript([]));
        return new Response(
          new ReadableStream({
            start(ctrl) {
              streams.set(runId, ctrl);
              script(runId, ctrl);
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }
      const cancel = /^\/api\/runs\/(run-\d+)\/cancel$/.exec(url);
      if (cancel) {
        cancels.push({ runId: cancel[1]!, token: (init?.headers as Record<string, string>)['x-run-token'] ?? null });
        const ctrl = streams.get(cancel[1]!);
        // The test controls when the server finishes, so intermediate UI assertions do not race a timer.
        finishCancellation = () => {
          ctrl?.enqueue(frame(cancel[1]!, 50, { type: 'complete', status: 'cancelled', durationMs: 9 }));
          ctrl?.close();
        };
        return jsonResponse({
          runId: cancel[1],
          labId: 'lab-67',
          correlationId: 'c',
          status: 'cancelled',
          mode: 'offline',
          startedAt: new Date(0).toISOString(),
          deadlineMs: 60_000,
          eventCount: 3,
        });
      }
      return jsonResponse({ error: { code: 'NOT_FOUND', message: url } }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('ChatPanel (L67)', () => {
  it('loads the history, streams a reply without duplicated tokens, then shows the saved turn', async () => {
    const user = userEvent.setup();
    scripts.push(finished(transcript([msg('u0', 'user', 'Earlier'), msg('a0', 'assistant', 'Earlier reply')])));
    // The send: tokens, with seq 1 delivered twice (a replay after a reconnect), and the stream left open.
    scripts.push((runId, ctrl) => {
      ctrl.enqueue(frame(runId, 0, { type: 'token', text: 'Hello' }));
      ctrl.enqueue(frame(runId, 1, { type: 'token', text: ' world' }));
      ctrl.enqueue(frame(runId, 1, { type: 'token', text: ' world' }));
    });
    renderApp('/labs/lab-67?tab=run');
    const log = await screen.findByRole('log', { name: 'Conversation' });
    expect(await within(log).findByText('Earlier reply')).toBeInTheDocument();
    expect(bodies[0]).toMatchObject({ input: { action: 'history', threadId: 'chat-1' } });

    await user.type(screen.getByLabelText('Message'), 'Hi there{Enter}');
    expect(await screen.findByTestId('chat-streaming')).toHaveTextContent(/^Assistant \(streaming\): Hello world▍$/);
    expect(bodies[1]).toMatchObject({ input: { action: 'send', threadId: 'chat-1', message: 'Hi there', retry: false } });

    // The server finishes the turn: the panel shows the saved transcript.
    const ctrl = streams.get('run-2')!;
    ctrl.enqueue(
      frame('run-2', 2, {
        type: 'result',
        output: {
          action: 'send',
          chat: transcript([
            msg('u0', 'user', 'Earlier'),
            msg('a0', 'assistant', 'Earlier reply'),
            msg('u1', 'user', 'Hi there'),
            msg('a1', 'assistant', 'Hello world'),
          ]),
        },
        validation: { passed: true, checks: [] },
      }),
    );
    ctrl.enqueue(frame('run-2', 3, { type: 'complete', status: 'succeeded', durationMs: 5 }));
    ctrl.close();
    await waitFor(() => expect(screen.queryByTestId('chat-streaming')).toBeNull());
    expect(
      within(log)
        .getAllByTestId('chat-message')
        .map((m) => m.textContent),
    ).toEqual(['You: Earlier', 'Assistant: Earlier reply', 'You: Hi there', 'Assistant: Hello world']);
  });

  it('Stop responds at once, cancels with the run token, and shows the partial reply as stopped', async () => {
    const user = userEvent.setup();
    scripts.push(finished(transcript([])));
    scripts.push((runId, ctrl) => ctrl.enqueue(frame(runId, 0, { type: 'token', text: 'Once upon' })));
    scripts.push(finished(transcript([msg('u1', 'user', 'Story please'), msg('a1', 'assistant', 'Once upon', 'stopped')])));
    renderApp('/labs/lab-67?tab=run');
    await screen.findByRole('log', { name: 'Conversation' });
    await waitFor(() => expect(bodies).toHaveLength(1));
    await user.type(screen.getByLabelText('Message'), 'Story please{Enter}');
    await screen.findByText(/Once upon/);
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByTestId('chat-status')).toHaveTextContent('Stopping…'); // before the server answers
    expect(cancels).toEqual([{ runId: 'run-2', token: 'tok-2-0123456789abcdef' }]);
    await act(async () => finishCancellation!());
    const stopped = await screen.findByText('Stopped');
    expect(stopped.closest('[data-testid="chat-message"]')).toHaveAttribute('data-status', 'stopped');
    expect(screen.getByTestId('chat-status')).toHaveTextContent(/Stopped\. The partial reply is kept/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('a failed turn offers Retry, which resends the same message as a retry', async () => {
    const user = userEvent.setup();
    scripts.push(finished(transcript([msg('u1', 'user', 'Are you there?', 'failed')])));
    scripts.push(
      finished(
        transcript([msg('u1', 'user', 'Are you there?'), msg('a1', 'assistant', 'Yes!')], {
          status: 'complete',
          retried: true,
          tokens: 2,
        }),
      ),
    );
    renderApp('/labs/lab-67?tab=run');
    expect(await screen.findByText('Failed — no reply')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Yes!')).toBeInTheDocument();
    expect(bodies[1]).toMatchObject({ input: { action: 'send', message: 'Are you there?', retry: true } });
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
