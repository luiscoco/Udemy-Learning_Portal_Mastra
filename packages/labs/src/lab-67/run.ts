import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type ChatTranscript, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type OpenedMemory, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { consumeStream } from '../shared/tool-stream.js';
import { lab67Definition } from './definition.js';
import { readTranscript, RESOURCE, storedMessages, textOf, unfinishedTurn, withStatus } from './transcript.js';

const STORE = 'lab-67-chat';
const threadLock = new KeyedLock();
export const TOKEN_DELAY_MS = { normal: 25, slow: 150 } as const;

export const Lab67InputSchema = z
  .object({
    action: z.enum(['send', 'history', 'delete-thread']),
    threadId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/, 'Use 3–41 lowercase letters, digits or dashes'),
    message: z.string().trim().max(1_000).default(''),
    retry: z.boolean().default(false),
    fault: z.enum(['none', 'fail', 'slow']).default('none'),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  .refine((v) => v.action !== 'send' || v.message.length > 0, { message: 'Type a message to send', path: ['message'] });
export type Lab67Input = z.infer<typeof Lab67InputSchema>;

export interface Lab67Output {
  action: Lab67Input['action'];
  chat: ChatTranscript;
  /** The reply text as the stream produced it; token events are checked from the run events. */
  streamed?: { text: string };
  removedOnRetry: number;
}

export const INSTRUCTIONS =
  'You are a friendly assistant in a chat. Use the earlier messages of this thread. Answer in two or three sentences.';

/** Offline chat model: answers from the thread (counts the user turns it was given) one word at a time. */
export function chatScript() {
  return (v: PromptView): ScriptedTurn => {
    const turn = v.userMessages.length;
    return {
      text:
        `(${turn}) You said: "${v.lastUser.slice(0, 120)}". ` +
        `This thread has ${turn} message${turn === 1 ? '' : 's'} from you so far. ` +
        'I am the offline chat model, answering one word at a time so you can watch the stream and press Stop whenever you like.',
    };
  };
}

const http503 = () =>
  Object.assign(new Error('HTTP 503 (fault injection)'), { name: 'AI_APICallError', statusCode: 503, isRetryable: false });

/** Injects a provider failure before the real call, so the fault costs nothing in live mode. */
function failingModel<M extends object>(inner: M): M {
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'doStream' || prop === 'doGenerate') return async () => Promise.reject(http503());
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const lab67: LabImplementation<Lab67Input, Lab67Output, LabServices> = {
  definition: lab67Definition as LabDefinition,
  inputSchema: Lab67InputSchema,
  // Runs on one thread are serialized: a second tab cannot interleave with a turn in progress.
  async run(ctx, input) {
    return threadLock.run(`${ctx.services.tenant.partition}:${input.threadId}`, () => runAction(ctx, input), ctx.signal);
  },
  validate(out, input, { events }) {
    if (out.action !== 'send')
      return summarizeChecks([
        {
          id: out.action === 'history' ? 'history-loaded' : 'thread-deleted',
          label: out.action === 'history' ? 'The thread history loaded from memory' : 'The thread was deleted',
          passed: out.action === 'history' ? out.chat.threadId === input.threadId : out.chat.messages.length === 0,
          message: `${out.chat.messages.length} message(s) in ${out.chat.threadId}`,
        },
      ]);
    const msgs = out.chat.messages;
    const last = msgs.at(-1);
    const user = msgs.at(-2);
    const failed = out.chat.turn?.status === 'failed';
    // The token events the browser received, from the run's own event log.
    const tokenEvents = events.filter((e) => e.type === 'token');
    const streamedText = tokenEvents.map((e) => (e.type === 'token' ? e.text : '')).join('');
    const seqs = tokenEvents.map((e) => e.seq);
    const resultSeq = events.find((e) => e.type === 'result')?.seq ?? Number.MAX_SAFE_INTEGER;
    // A retry must not leave the question twice at the end of the thread (question, partial, question, reply).
    const before = msgs.slice(0, -2).filter((m) => !(m.role === 'assistant' && m.status !== 'complete'));
    const repeatedAtEnd = before.at(-1)?.role === 'user' && before.at(-1)?.text === input.message;
    return summarizeChecks([
      {
        id: 'streamed-incrementally',
        label: 'The reply arrived token by token before the run finished',
        passed: failed || (tokenEvents.length >= 2 && seqs.every((q) => q < resultSeq)),
        message: failed ? 'no reply (provider failure)' : `${tokenEvents.length} token events`,
      },
      {
        id: 'no-duplicate-tokens',
        label: 'Every streamed token was delivered once, and together they equal the saved reply',
        passed:
          failed ||
          (new Set(seqs).size === seqs.length &&
            seqs.every((q, i) => i === 0 || q > seqs[i - 1]!) &&
            last?.role === 'assistant' &&
            last.text === streamedText &&
            streamedText === (out.streamed?.text ?? '')),
        message: failed ? 'nothing streamed' : `${streamedText.length} characters streamed and saved`,
      },
      {
        id: 'history-persisted',
        label: 'The thread ends with your message and the complete reply',
        passed: failed
          ? last?.role === 'user' && last.status === 'failed'
          : user?.role === 'user' && user.text === input.message && last?.status === 'complete',
        message: `${msgs.length} message(s) in ${out.chat.threadId}`,
      },
      {
        id: 'retry-replaced-turn',
        label: 'A retry replaced the unfinished turn instead of repeating the question',
        passed: !input.retry || !repeatedAtEnd,
        message: input.retry
          ? `removed ${out.removedOnRetry} unfinished message(s)${repeatedAtEnd ? '; the question is repeated' : ''}`
          : 'not a retry',
      },
      {
        id: 'failure-recoverable',
        label: 'A failed turn is marked failed so it can be retried',
        passed: !failed || last?.status === 'failed',
        message: failed ? 'the provider failed before any token; press Retry' : 'no failure',
      },
    ]);
  },
};

async function runAction(ctx: RunContext<LabServices>, input: Lab67Input): Promise<Lab67Output> {
  const opened = await ctx.services.memory.open(STORE, { lastMessages: 20 });
  let partialToTag = false;
  let startedCount = (await storedMessages(opened, input.threadId)).length;
  try {
    if (input.action === 'history')
      return { action: 'history', chat: await readTranscript(opened, input.threadId), removedOnRetry: 0 };
    if (input.action === 'delete-thread') {
      if (await opened.memory.getThreadById({ threadId: input.threadId })) await opened.memory.deleteThread(input.threadId);
      return { action: 'delete-thread', chat: await readTranscript(opened, input.threadId), removedOnRetry: 0 };
    }

    let removedOnRetry = 0;
    if (input.retry) {
      const ids = unfinishedTurn(withStatus(await storedMessages(opened, input.threadId)), input.message);
      if (ids.length) await opened.memory.deleteMessages(ids);
      removedOnRetry = ids.length;
      ctx.log(
        'info',
        ids.length ? `Retry: removed the unfinished turn (${ids.length} message(s))` : 'Retry: nothing unfinished to replace',
      );
    }
    startedCount = (await storedMessages(opened, input.threadId)).length;
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: chatScript(),
      tokenDelayMs: input.fault === 'slow' ? TOKEN_DELAY_MS.slow : TOKEN_DELAY_MS.normal,
    });
    const model = input.fault === 'fail' ? failingModel(resolved.model as object) : resolved.model;
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'lab67-chat',
        name: 'Chat assistant',
        instructions: INSTRUCTIONS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: model as any,
        memory: opened.memory,
      }),
    );
    ctx.emit({ type: 'workflow-step', stepId: 'reply', status: 'running', input: { threadId: input.threadId } });
    partialToTag = true;
    let text = '';
    let tokens = 0;
    let failure: string | undefined;
    try {
      const stream = await agent.stream(input.message, {
        memory: { thread: input.threadId, resource: RESOURCE },
        abortSignal: ctx.signal,
      });
      // Count the token events this turn emits (the browser receives exactly these).
      const counting = {
        ...ctx,
        emit: (e: Parameters<typeof ctx.emit>[0]) => {
          if (e.type === 'token') tokens += 1;
          ctx.emit(e);
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await consumeStream(counting, stream as any);
      text = res.text;
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      failure = err instanceof Error ? err.message : String(err);
    }
    if (ctx.signal.aborted) throw ctx.signal.reason;
    partialToTag = false;

    const after = withStatus(await storedMessages(opened, input.threadId));
    const lastStored = after.at(-1);
    if (failure || !text) {
      // The turn failed before any token. Mastra 1.78 saves the question plus an EMPTY reply: drop the
      // empty reply and tag the question failed, so history shows one failed question and Retry can replace it.
      const added = (await storedMessages(opened, input.threadId)).slice(startedCount);
      const empty = added.filter((m) => m.role === 'assistant' && !textOf(m).trim());
      if (empty.length) await opened.memory.deleteMessages(empty.map((m) => m.id));
      const question = added.find((m) => m.role === 'user' && textOf(m) === input.message);
      if (question) {
        const content = (question.content ?? {}) as { metadata?: Record<string, unknown> };
        await opened.memory.updateMessages({
          messages: [
            {
              id: question.id,
              content: { ...content, metadata: { ...(content.metadata ?? {}), chatStatus: 'failed' } },
            } as never,
          ],
        });
      } else
        await opened.memory.saveMessages({
          messages: [
            {
              id: randomUUID(),
              threadId: input.threadId,
              resourceId: RESOURCE,
              role: 'user',
              createdAt: new Date(),
              content: { format: 2, parts: [{ type: 'text', text: input.message }], metadata: { chatStatus: 'failed' } },
            },
          ] as never,
        });
      ctx.log(
        'warn',
        `The model failed before replying${failure ? ` (${failure.slice(0, 80)})` : ''}; the turn is kept as failed.`,
      );
      ctx.emit({ type: 'workflow-step', stepId: 'reply', status: 'failed' });
      return {
        action: 'send',
        chat: await readTranscript(opened, input.threadId, { status: 'failed', retried: input.retry, tokens: 0 }),
        streamed: { text: '' },
        removedOnRetry,
      };
    }
    ctx.emit({ type: 'workflow-step', stepId: 'reply', status: 'success', output: { tokens } });
    const chat = await readTranscript(opened, input.threadId, {
      status: 'complete',
      retried: input.retry,
      tokens,
      ...(lastStored?.role === 'assistant' ? { replyId: lastStored.id } : {}),
    });
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated } });
    return { action: 'send', chat, streamed: { text }, removedOnRetry };
  } finally {
    // Stopped mid-reply: Mastra kept the partial reply; tag it so history shows "stopped", not an answer.
    if (partialToTag && ctx.signal.aborted) await tagStopped(opened, input.threadId, startedCount).catch(() => undefined);
    await opened.close();
  }
}

async function tagStopped(opened: OpenedMemory, threadId: string, before: number) {
  for (let i = 0; i < 50; i++) {
    const msgs = await storedMessages(opened, threadId);
    const reply = msgs.slice(before).find((m) => m.role === 'assistant');
    if (reply) {
      const content = (reply.content ?? {}) as { metadata?: Record<string, unknown> };
      await opened.memory.updateMessages({
        messages: [
          { id: reply.id, content: { ...content, metadata: { ...(content.metadata ?? {}), chatStatus: 'stopped' } } } as never,
        ],
      });
      return;
    }
    if (msgs.length > before && i > 10) return; // only the question was saved: it shows as failed
    await new Promise((r) => setTimeout(r, 20));
  }
}
