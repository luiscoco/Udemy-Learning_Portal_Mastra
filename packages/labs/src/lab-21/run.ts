import { existsSync, statSync } from 'node:fs';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type OpenedMemory, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { lab21Definition } from './definition.js';

export const RESOURCE = 'learner';
export const STORE = 'lab-21';
const threadLock = new KeyedLock();

export const Lab21InputSchema = z.object({
  threadId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/, 'Use 3–41 lowercase letters, digits or dashes'),
  messages: z.array(z.string().trim().min(1).max(500)).min(1).max(4),
  followUp: z.string().trim().min(1).max(500),
  lastMessages: z.number().int().min(1).max(40),
  resetThread: z.boolean(),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab21Input = z.infer<typeof Lab21InputSchema>;

export interface HistoryItem {
  role: string;
  text: string;
  createdAt: string;
}

export interface Lab21Output {
  threadId: string;
  dbFile: string;
  dbBytes: number;
  reset: boolean;
  session1: { sent: string[]; replies: string[] };
  restart: { closedFirstStore: boolean; reopened: boolean };
  /** What the NEW instances found in storage before the follow-up was sent. */
  recalledAfterRestart: HistoryItem[];
  followUp: { question: string; answer: string };
  /** Full thread after the follow-up, from memory.recall(). */
  history: HistoryItem[];
  /** Offline only: what the follow-up's model call received from memory (messages before the new one). */
  modelSawOnFollowUp: { priorMessages: number; userMessages: string[] } | null;
  remembered: { name: string | null; preference: string | null };
}

const textOf = (m: { content: { parts?: { type: string; text?: string }[]; content?: string } }) =>
  m.content.parts?.map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join('') ?? m.content.content ?? '';

/** Facts the follow-up should be able to answer from session 1. */
export function factsIn(texts: string[]) {
  const all = texts.join(' ');
  const name = all.match(/\b(?:I'm|I am|my name is)\s+([A-ZÁÉÍÓÚ][a-záéíóúñ]+)/i)?.[1] ?? null;
  const preference = all.match(/\bprefer\s+([a-z]+)/i)?.[1]?.toLowerCase() ?? null;
  return { name, preference };
}

/** Offline model: answers only from the user messages it actually receives (its context window). */
export function offlineScript(sink: { lastUserMessages: string[]; priorMessages: number }) {
  return (v: PromptView): ScriptedTurn => {
    sink.lastUserMessages = v.userMessages;
    sink.priorMessages = v.raw.filter((m) => m.role !== 'system').length - 1;
    const earlier = v.userMessages.slice(0, -1);
    const { name, preference } = factsIn(earlier);
    if (!/remind|remember|what('s| is) my/i.test(v.lastUser)) return { text: 'Noted! Tell me more whenever you like.' };
    const parts = [
      name ? `Your name is ${name}` : 'I don’t know your name yet',
      preference ? `you prefer ${preference}` : 'I don’t know how you like to travel',
    ];
    return { text: `${parts.join(', and ')}. (I can see ${earlier.length} earlier message(s) from you.)` };
  };
}

async function recallAll(opened: OpenedMemory, threadId: string): Promise<HistoryItem[]> {
  const res = await opened.memory.recall({ threadId, resourceId: RESOURCE, perPage: false });
  return res.messages.map((m) => ({ role: m.role, text: textOf(m as never), createdAt: new Date(m.createdAt).toISOString() }));
}

function buildAgent(ctx: RunContext<LabServices>, opened: OpenedMemory, model: unknown) {
  return withLabLogger(
    ctx,
    new Agent({
      id: 'travel-assistant',
      name: 'Travel Assistant',
      instructions:
        'You are a friendly travel assistant. Use earlier messages in this conversation to remember the user’s name and preferences. Answer in one or two sentences.',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: model as any,
      memory: opened.memory,
    }),
  );
}

export const lab21: LabImplementation<Lab21Input, Lab21Output, LabServices> = {
  definition: lab21Definition as LabDefinition,
  inputSchema: Lab21InputSchema,

  run(ctx, input) {
    // Runs on the same thread are serialized: two tabs (or test workers) must not interleave a reset,
    // writes and the restart check on one conversation.
    return threadLock.run(`${STORE}:${input.threadId}`, () => runSession(ctx, input), ctx.signal);
  },

  validate(out, input) {
    return validateRun(out, input);
  },
};

async function runSession(ctx: RunContext<LabServices>, input: Lab21Input): Promise<Lab21Output> {
  {
    const sink = { lastUserMessages: [] as string[], priorMessages: 0 };
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript(sink) });
    const memoryOptions = { lastMessages: input.lastMessages };
    const thread = { thread: input.threadId, resource: RESOURCE };
    const dbFile = ctx.services.memory.file(STORE);
    let first: OpenedMemory | undefined;
    let second: OpenedMemory | undefined;
    try {
      // ---- Session 1 ----
      ctx.emit({ type: 'workflow-step', stepId: 'session-1', status: 'running', input: { threadId: input.threadId } });
      first = await ctx.services.memory.open(STORE, memoryOptions);
      if (input.resetThread && (await first.memory.getThreadById({ threadId: input.threadId }))) {
        await first.memory.deleteThread(input.threadId);
        ctx.log('info', `Reset: deleted thread ${input.threadId}`);
      }
      const agent1 = buildAgent(ctx, first, resolved.model);
      const replies: string[] = [];
      for (const text of input.messages) {
        const r = await agent1.generate(text, { memory: thread, abortSignal: ctx.signal });
        ctx.throwIfAborted();
        replies.push(r.text);
      }
      ctx.emit({ type: 'workflow-step', stepId: 'session-1', status: 'success', output: { sent: input.messages.length } });

      // ---- Restart: close the database and drop every Mastra object ----
      ctx.emit({ type: 'workflow-step', stepId: 'restart', status: 'running' });
      await first.close();
      first = undefined;
      const dbBytes = existsSync(dbFile) ? statSync(dbFile).size : 0;
      ctx.log('info', `Closed the store and discarded agent and memory. Database on disk: ${dbBytes} bytes.`);
      second = await ctx.services.memory.open(STORE, memoryOptions);
      const recalledAfterRestart = await recallAll(second, input.threadId);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'restart',
        status: 'success',
        output: { reopened: true, messagesFound: recalledAfterRestart.length },
      });

      // ---- Session 2: a brand-new agent answers from persisted history ----
      ctx.emit({ type: 'workflow-step', stepId: 'session-2', status: 'running' });
      const agent2 = buildAgent(ctx, second, resolved.model);
      const answer = await agent2.generate(input.followUp, { memory: thread, abortSignal: ctx.signal });
      ctx.throwIfAborted();
      const history = await recallAll(second, input.threadId);
      ctx.emit({ type: 'workflow-step', stepId: 'session-2', status: 'success', output: { historyLength: history.length } });

      ctx.setResultExtras({
        effective: {
          mode: ctx.mode,
          modelId: input.modelId,
          simulated: resolved.simulated,
          lastMessages: input.lastMessages,
          storage: 'libsql (local file)',
        },
      });
      return {
        threadId: input.threadId,
        dbFile: `.data/memory/${STORE}.db`,
        dbBytes,
        reset: input.resetThread,
        session1: { sent: input.messages, replies },
        restart: { closedFirstStore: true, reopened: true },
        recalledAfterRestart,
        followUp: { question: input.followUp, answer: answer.text },
        history,
        modelSawOnFollowUp:
          ctx.mode === 'offline' ? { priorMessages: sink.priorMessages, userMessages: sink.lastUserMessages.slice(0, -1) } : null,
        remembered: factsIn(input.messages),
      };
    } finally {
      await first?.close();
      await second?.close();
    }
  }
}

function validateRun(out: Lab21Output, input: Lab21Input) {
  {
    const recalledUser = out.recalledAfterRestart.filter((m) => m.role === 'user').map((m) => m.text);
    const survived = input.messages.every((m) => recalledUser.includes(m));
    const times = out.history.map((h) => Date.parse(h.createdAt));
    const ordered = times.every((t, i) => i === 0 || t >= times[i - 1]!);
    const lastFour = out.history.slice(-(input.messages.length + 1) * 2).map((h) => h.role);
    const alternates = lastFour.every((r, i) => r === (i % 2 === 0 ? 'user' : 'assistant'));
    const facts = [out.remembered.name, out.remembered.preference].filter((f): f is string => Boolean(f));
    const answer = out.followUp.answer.toLowerCase();
    const window = out.modelSawOnFollowUp;
    return summarizeChecks([
      {
        id: 'persisted-to-disk',
        label: 'The conversation was written to a database file on disk',
        passed: out.dbBytes > 0,
        message: `${out.dbFile} (${out.dbBytes} bytes)`,
      },
      {
        id: 'survives-restart',
        label: 'After closing and reopening the store, new instances found every message from session 1',
        passed: survived,
        message: `${recalledUser.length} user message(s) recalled after restart`,
      },
      {
        id: 'chronological',
        label: 'The recalled history is in chronological order (user and assistant alternating)',
        passed: ordered && alternates,
        message: out.history.map((h) => h.role[0]).join(''),
      },
      {
        id: 'window-respected',
        label: 'The follow-up received at most lastMessages earlier messages as context',
        passed: window === null || window.priorMessages <= input.lastMessages,
        message:
          window === null
            ? 'live: window applied by Mastra memory'
            : `${window.priorMessages} earlier message(s) in context (limit ${input.lastMessages})`,
      },
      {
        id: 'answer-uses-history',
        label: 'The answer after the restart uses facts from session 1',
        // Stem match ("trains" ↔ "by train"): real models paraphrase; the name must appear as written.
        passed: facts.length > 0 && facts.every((f) => answer.includes(f.toLowerCase().replace(/s$/, ''))),
        message: facts.length ? `expected: ${facts.join(', ')}` : 'session 1 contains no name or preference to remember',
      },
    ]);
  }
}
