import { afterAll, describe, expect, it } from 'vitest';
import type { ChatTranscript } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { testMemoryDir } from '../test-memory.js';
import { lab67Definition } from './definition.js';
import { Lab67InputSchema, lab67, type Lab67Output } from './run.js';
import { unfinishedTurn, withStatus } from './transcript.js';

const services = createLabServices({ serverMode: 'offline', env: {}, memoryDir: testMemoryDir('lab-67') });
const runner = new LabRunner({
  registry: new LabRegistry([lab67]),
  services,
  servicesFor: (o) => services.forTenant(o),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab67Definition.exampleInput;
let n = 0;
const thread = () => `t-${process.pid}-${++n}`;

async function run(input: Record<string, unknown>, ownerId?: string) {
  const r = runner.start('lab-67', { input: { ...base, ...input } }, ownerId ? { ownerId } : {});
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  return {
    snap,
    events,
    result: result?.type === 'result' ? result : undefined,
    out: (result?.type === 'result' ? result.output : undefined) as Lab67Output,
  };
}
const history = async (threadId: string, ownerId?: string) => (await run({ action: 'history', threadId }, ownerId)).out.chat;

describe('transcript status', () => {
  const m = (id: string, role: string, text: string, metadata?: Record<string, unknown>) => ({
    id,
    role,
    createdAt: new Date(0),
    content: { parts: [{ type: 'text', text }], ...(metadata ? { metadata } : {}) },
  });
  it('a tag wins; otherwise a trailing reply without model metadata is stopped, a trailing question failed', () => {
    const done = m('a1', 'assistant', 'hello', { modelId: 'x', provider: 'p' });
    expect(withStatus([m('u1', 'user', 'q'), done]).map((x) => x.status)).toEqual(['complete', 'complete']);
    expect(withStatus([m('u1', 'user', 'q'), m('a1', 'assistant', 'hel')]).at(-1)?.status).toBe('stopped');
    expect(withStatus([m('u1', 'user', 'q')]).at(-1)?.status).toBe('failed');
    expect(
      withStatus([m('u1', 'user', 'q'), m('a1', 'assistant', 'he', { chatStatus: 'stopped', modelId: 'x' })]).at(-1)?.status,
    ).toBe('stopped');
    const msgs = withStatus([m('u0', 'user', 'old'), done, m('u1', 'user', 'q'), m('a2', 'assistant', 'par')]);
    expect(unfinishedTurn(msgs, 'q')).toEqual(['u1', 'a2']);
    expect(unfinishedTurn(msgs, 'other')).toEqual([]);
  });
});

describe('Lab 67', () => {
  it('streams a reply token by token and persists the turn', async () => {
    const t = thread();
    const { snap, events, result, out } = await run({ threadId: t, message: 'Hello there' });
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(10);
    expect(out.chat.messages.map((x) => `${x.role}:${x.status}`)).toEqual(['user:complete', 'assistant:complete']);
    expect(out.chat.messages[1]!.text).toBe(tokens.map((e) => (e.type === 'token' ? e.text : '')).join(''));
    const second = await run({ threadId: t, message: 'And again' });
    expect(second.out.chat.messages[3]!.text).toMatch(/^\(2\) You said: "And again"/); // the model saw the earlier turn
    expect((await history(t)).messages).toHaveLength(4);
  });

  it('Stop keeps the partial reply tagged as stopped; Retry replaces the turn', async () => {
    const t = thread();
    const r = runner.start('lab-67', { input: { ...base, threadId: t, message: 'Tell me a long story', fault: 'slow' } });
    for (let i = 0; i < 200 && runner.events(r.runId).filter((e) => e.type === 'token').length < 3; i++)
      await new Promise((res) => setTimeout(res, 20));
    const t0 = Date.now();
    runner.cancel(r.runId);
    expect((await runner.waitFor(r.runId)).status).toBe('cancelled');
    expect(Date.now() - t0).toBeLessThan(1_000);
    let chat: ChatTranscript | undefined;
    for (let i = 0; i < 40; i++) {
      chat = await history(t);
      if (chat.messages.at(-1)?.status === 'stopped') break;
      await new Promise((res) => setTimeout(res, 50));
    }
    expect(chat!.messages.map((x) => `${x.role}:${x.status}`)).toEqual(['user:complete', 'assistant:stopped']);
    const retried = await run({ threadId: t, message: 'Tell me a long story', retry: true });
    expect(retried.result?.validation?.passed).toBe(true);
    expect(retried.out.removedOnRetry).toBe(2);
    expect(retried.out.chat.messages.map((x) => `${x.role}:${x.status}`)).toEqual(['user:complete', 'assistant:complete']);
  });

  it('a provider failure keeps the question as failed, and Retry answers it once', async () => {
    const t = thread();
    const failed = await run({ threadId: t, message: 'Are you there?', fault: 'fail' });
    expect(failed.result?.validation?.passed).toBe(true);
    expect(failed.out.chat.turn?.status).toBe('failed');
    expect(failed.out.chat.messages.map((x) => `${x.role}:${x.status}`)).toEqual(['user:failed']);
    const retried = await run({ threadId: t, message: 'Are you there?', retry: true });
    expect(retried.result?.validation?.passed).toBe(true);
    expect(retried.out.chat.messages.map((x) => `${x.role}:${x.text.slice(0, 14)}`)).toEqual([
      'user:Are you there?',
      'assistant:(1) You said: ',
    ]);
  });

  it('threads are private per learner, and a thread can be deleted', async () => {
    const t = thread();
    await run({ threadId: t, message: 'Alice only' }, 'dev:alice');
    expect((await history(t, 'dev:bob')).messages).toEqual([]);
    expect((await history(t, 'dev:alice')).messages).toHaveLength(2);
    const del = await run({ action: 'delete-thread', threadId: t }, 'dev:alice');
    expect(del.result?.validation?.passed).toBe(true);
    expect(del.out.chat.messages).toEqual([]);
  });

  it('validates inputs', () => {
    expect(Lab67InputSchema.safeParse({ ...base, message: '' }).success).toBe(false); // send needs a message
    expect(Lab67InputSchema.safeParse({ ...base, action: 'history', message: '' }).success).toBe(true);
    expect(Lab67InputSchema.safeParse({ ...base, threadId: '../x' }).success).toBe(false);
  });
});
