import type { Agent } from '@mastra/core/agent';
import type { Memory } from '@mastra/memory';

export type ThreadResult<T> = { ok: true; data: T } | { ok: false; code: 'NOT_FOUND' | 'ERROR'; message: string };

export interface ThreadSummary {
  id: string;
  title: string;
}
export interface HistoryMessage {
  role: string;
  text: string;
}

/** Thread operations, always on behalf of a signed-in user (the Mastra resource id). */
export interface ThreadStore {
  create(user: string, title: string): Promise<ThreadResult<ThreadSummary>>;
  list(user: string): Promise<ThreadResult<ThreadSummary[]>>;
  history(user: string, threadId: string): Promise<ThreadResult<{ thread: ThreadSummary; messages: HistoryMessage[] }>>;
  send(user: string, threadId: string, text: string): Promise<ThreadResult<{ reply: string }>>;
  reset(user: string, threadId: string): Promise<ThreadResult<{ removed: number }>>;
  delete(user: string, threadId: string): Promise<ThreadResult<{ deleted: true }>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

const textOf = (m: { content: { parts?: { type: string; text?: string }[] } }) =>
  m.content.parts?.map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join('') ?? '';

/** The same answer for "does not exist" and "not yours": callers cannot probe for other users' threads. */
const NOT_FOUND = { ok: false, code: 'NOT_FOUND', message: 'Thread not found' } as const;

/**
 * The boundary: every operation first loads the thread and checks it belongs to the caller. Mastra's own
 * checks (recall and agent calls refuse foreign threads) stay as a second line, but their messages, which
 * name the real owner, never reach the caller.
 */
export function createGuardedThreads(memory: Memory, agent: AnyAgent, signal?: AbortSignal): ThreadStore {
  const owned = async (user: string, threadId: string) => {
    const thread = await memory.getThreadById({ threadId });
    return thread && thread.resourceId === user ? thread : null;
  };
  const messagesOf = async (user: string, threadId: string) =>
    (await memory.recall({ threadId, resourceId: user, perPage: false })).messages;

  return {
    async create(user, title) {
      const t = await memory.createThread({ resourceId: user, title }); // id: server-generated UUID
      return { ok: true, data: { id: t.id, title: t.title ?? '' } };
    },
    async list(user) {
      const res = await memory.listThreads({ filter: { resourceId: user }, perPage: false });
      return { ok: true, data: res.threads.map((t) => ({ id: t.id, title: t.title ?? '' })) };
    },
    async history(user, threadId) {
      const t = await owned(user, threadId);
      if (!t) return NOT_FOUND;
      const messages = (await messagesOf(user, threadId)).map((m) => ({ role: m.role, text: textOf(m as never) }));
      return { ok: true, data: { thread: { id: t.id, title: t.title ?? '' }, messages } };
    },
    async send(user, threadId, text) {
      if (!(await owned(user, threadId))) return NOT_FOUND;
      const r = await agent.generate(text, { memory: { thread: threadId, resource: user }, abortSignal: signal });
      return { ok: true, data: { reply: r.text } };
    },
    async reset(user, threadId) {
      if (!(await owned(user, threadId))) return NOT_FOUND;
      const ids = (await messagesOf(user, threadId)).map((m) => m.id);
      if (ids.length) await memory.deleteMessages(ids);
      return { ok: true, data: { removed: ids.length } }; // thread, title and owner are kept
    },
    async delete(user, threadId) {
      if (!(await owned(user, threadId))) return NOT_FOUND;
      await memory.deleteThread(threadId);
      return { ok: true, data: { deleted: true } };
    },
  };
}

/**
 * ANTI-PATTERN, for contrast only: calls Mastra directly and trusts the thread record it gets back.
 * getThreadById/deleteThread take no owner, so this "works" for anyone who knows an id.
 */
export function createRawThreads(memory: Memory, agent: AnyAgent, signal?: AbortSignal): ThreadStore {
  const fail = (err: unknown): ThreadResult<never> => ({
    ok: false,
    code: 'ERROR',
    message: String((err as Error).message ?? err),
  });
  return {
    async create(user, title) {
      const t = await memory.createThread({ resourceId: user, title });
      return { ok: true, data: { id: t.id, title: t.title ?? '' } };
    },
    async list(user) {
      const res = await memory.listThreads({ filter: { resourceId: user }, perPage: false });
      return { ok: true, data: res.threads.map((t) => ({ id: t.id, title: t.title ?? '' })) };
    },
    async history(_user, threadId) {
      const t = await memory.getThreadById({ threadId });
      if (!t) return NOT_FOUND;
      // Bug: uses the thread's owner instead of the caller, so anyone can read any thread.
      const res = await memory.recall({ threadId, resourceId: t.resourceId, perPage: false });
      return {
        ok: true,
        data: {
          thread: { id: t.id, title: t.title ?? '' },
          messages: res.messages.map((m) => ({ role: m.role, text: textOf(m as never) })),
        },
      };
    },
    async send(user, threadId, text) {
      try {
        const r = await agent.generate(text, { memory: { thread: threadId, resource: user }, abortSignal: signal });
        return { ok: true, data: { reply: r.text } };
      } catch (err) {
        return fail(err); // Mastra refuses, but its message names the real owner
      }
    },
    async reset(_user, threadId) {
      const t = await memory.getThreadById({ threadId });
      if (!t) return NOT_FOUND;
      const ids = (await memory.recall({ threadId, resourceId: t.resourceId, perPage: false })).messages.map((m) => m.id);
      if (ids.length) await memory.deleteMessages(ids);
      return { ok: true, data: { removed: ids.length } };
    },
    async delete(_user, threadId) {
      await memory.deleteThread(threadId); // no owner check exists on this API
      return { ok: true, data: { deleted: true } };
    },
  };
}
