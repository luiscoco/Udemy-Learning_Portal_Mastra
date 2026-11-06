import { describe, expect, it, vi } from 'vitest';
import { TutorRequestSchema, type TutorEvent } from '@mlp/contracts';
import { createApiClient } from './client.js';

const started = { type: 'started', requestId: 't1', seq: 0, labId: 'lab-01', mode: 'offline', modelId: null, simulated: true };
const body = { labId: 'lab-01', question: 'Explain the lesson', mode: 'offline' as const };
const response = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });

describe('tutor SDK', () => {
  it('validates input limits, unknown fields and live model selection', () => {
    for (const bad of [
      { ...body, question: '' },
      { ...body, question: 'x'.repeat(2001) },
      { ...body, sessionId: 'private' },
      { ...body, mode: 'live' },
    ]) {
      expect(TutorRequestSchema.safeParse(bad).success).toBe(false);
    }
  });
  it('streams ordered typed snapshots and binds the account without provider credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response([
        started,
        { type: 'text', seq: 1, requestId: 't1', text: '**Hello**' },
        { type: 'complete', seq: 2, requestId: 't1', text: '**Hello**' },
      ]),
    );
    const events: TutorEvent[] = [];
    await createApiClient({ fetch }).tutor.answer('dev:alice', body, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['started', 'text', 'complete']);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin', headers: { 'x-run-subject': 'dev%3Aalice' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [started],
    [{ ...started, labId: 'lab-02' }],
    [{ ...started, simulated: false }],
    [started, { type: 'text', seq: 2, requestId: 't1', text: 'out of order' }],
    [started, { type: 'complete', seq: 1, requestId: 'other', text: 'wrong identity' }],
    [started, { type: 'complete', seq: 1, requestId: 't1', text: '' }],
  ])('refuses incomplete or invalid streams without retrying (%#)', async (...events) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(events));
    await expect(createApiClient({ fetch }).tutor.answer('alice', body, () => undefined)).rejects.toMatchObject({
      code: expect.stringMatching(/CONTRACT|NETWORK/),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed JSON and propagates caller abort while cancelling its reader', async () => {
    const cancel = vi.fn();
    let source: ReadableStreamDefaultController<Uint8Array>;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              source = c;
            },
            cancel,
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const ctrl = new AbortController();
    const call = createApiClient({ fetch }).tutor.answer('alice', body, () => ctrl.abort(), ctrl.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    source!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(started)}\n\n`));
    // Fetch itself normally observes abort. This custom body makes a frame arrive after cancellation.
    source!.enqueue(new TextEncoder().encode('data: invalid\n\n'));
    await expect(call).rejects.toBeDefined();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
