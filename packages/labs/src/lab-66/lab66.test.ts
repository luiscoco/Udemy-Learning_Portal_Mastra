import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab66Definition } from './definition.js';
import { Lab66InputSchema, lab66, type Lab66Output } from './run.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab66]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab66Definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-66', { input });
  const snap = await runner.waitFor(r.runId);
  const result = runner.events(r.runId).find((e) => e.type === 'result');
  return { snap, result: result?.type === 'result' ? result : undefined };
}

describe('Lab 66', () => {
  it('a dropped stream resumes with Last-Event-ID: contiguous, no duplicates, typed errors, no credentials', async () => {
    const { snap, result } = await run(base);
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    const out = result!.output as Lab66Output;
    expect(out.streamConnections).toBe(2);
    expect(out.reconnects).toEqual([{ attempt: 1, lastSeq: 2 }]);
    expect(out.requests.find((r) => r.lastEventId)?.lastEventId).toBe('2');
    expect(out.events.map((e) => e.seq)).toEqual(out.events.map((_, i) => i));
    expect(out.events.at(-1)?.type).toBe('complete');
    expect(out.rendered).toEqual({ status: 'succeeded', text: 'Echo: Hello from the typed client' });
    expect(out.calls.map((c) => `${c.method}:${c.code ?? 'ok'}`)).toEqual([
      'labs.get:ok',
      'runs.start:ok',
      'runs.events:ok',
      'runs.get:ok',
      'runs.start (empty message):VALIDATION_FAILED',
      'labs.get (unknown lab):NOT_FOUND',
    ]);
    expect(out.requests.every((r) => r.headers.every((h) => !/authorization|api-key/i.test(h)))).toBe(true);
    expect(out.resources).toEqual({ closed: true, openSockets: 0 });
  });

  it('contract drift becomes a CONTRACT error for snapshots and events', async () => {
    const snapshot = (await run({ ...base, drift: 'snapshot', dropAfterEvents: 0 })).result!;
    expect(snapshot.validation?.passed).toBe(true);
    expect((snapshot.output as Lab66Output).calls.find((c) => c.method === 'runs.get')).toMatchObject({
      code: 'CONTRACT',
      detail: 'status',
    });
    const event = (await run({ ...base, drift: 'event', dropAfterEvents: 0 })).result!;
    expect(event.validation?.passed).toBe(true);
    const out = event.output as Lab66Output;
    expect(out.calls.find((c) => c.method === 'runs.events')?.code).toBe('CONTRACT');
    expect(out.events.length).toBe(1); // stopped at the first bad event; nothing after it was rendered
  });

  it('cancel with the run token ends the run as cancelled', async () => {
    const { result } = await run({ ...base, delayMs: 1_000, dropAfterEvents: 0, cancelAfterMs: 150 });
    const out = result!.output as Lab66Output;
    expect(result?.validation?.passed).toBe(true);
    expect(out.rendered.status).toBe('cancelled');
    expect(out.calls.find((c) => c.method === 'runs.cancel')?.outcome).toBe('ok');
  });

  it('validates inputs', () => {
    expect(Lab66InputSchema.safeParse({ ...base, dropAfterEvents: 7 }).success).toBe(false);
    expect(Lab66InputSchema.safeParse({ ...base, drift: 'other' }).success).toBe(false);
  });
});
