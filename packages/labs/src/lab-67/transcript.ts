import type { ChatMessage, ChatTranscript } from '@mlp/contracts';
import type { OpenedMemory } from '@mlp/mastra-runtime';

export const RESOURCE = 'learner';

interface StoredMessage {
  id: string;
  role: string;
  createdAt: Date | string;
  content: unknown;
}
const contentOf = (m: StoredMessage) =>
  (m.content ?? {}) as { parts?: { type: string; text?: string }[]; metadata?: Record<string, unknown> };
export const textOf = (m: StoredMessage) =>
  (contentOf(m).parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');

/**
 * Status of each message. A reply tagged by this lab (chatStatus) wins. Otherwise (a crash before tagging):
 * Mastra 1.78 stores model metadata only on a reply that finished, so a trailing reply without it is a
 * stopped partial, and a trailing user message without a reply is a failed turn.
 */
export function withStatus(stored: StoredMessage[]): ChatMessage[] {
  return stored
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i, all) => {
      const meta = contentOf(m).metadata ?? {};
      const last = i === all.length - 1;
      let status: ChatMessage['status'] = 'complete';
      if (meta.chatStatus === 'stopped' || meta.chatStatus === 'failed') status = meta.chatStatus;
      else if (m.role === 'assistant' && last && !meta.modelId && !meta.provider) status = 'stopped';
      else if (m.role === 'user' && last) status = 'failed';
      return {
        id: m.id,
        role: m.role as ChatMessage['role'],
        text: textOf(m).slice(0, 20_000),
        status,
        createdAt: new Date(m.createdAt).toISOString(),
      };
    });
}

export async function storedMessages(opened: OpenedMemory, threadId: string): Promise<StoredMessage[]> {
  if (!(await opened.memory.getThreadById({ threadId }))) return [];
  const res = await opened.memory.recall({ threadId, resourceId: RESOURCE, perPage: false });
  return res.messages as unknown as StoredMessage[];
}

export async function readTranscript(
  opened: OpenedMemory,
  threadId: string,
  turn?: ChatTranscript['turn'],
): Promise<ChatTranscript> {
  const messages = withStatus(await storedMessages(opened, threadId));
  const listed = await opened.memory.listThreads({ filter: { resourceId: RESOURCE }, perPage: false });
  const threads = await Promise.all(
    listed.threads
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50)
      .map(async (t) => {
        const first =
          t.id === threadId
            ? messages.find((m) => m.role === 'user')
            : withStatus(await storedMessages(opened, t.id)).find((m) => m.role === 'user');
        return {
          id: t.id,
          title: (first?.text ?? t.title ?? t.id).slice(0, 80) || t.id,
          updatedAt: new Date(t.updatedAt).toISOString(),
        };
      }),
  );
  return { threadId, threads, messages, ...(turn ? { turn } : {}) };
}

/** The ids of an unfinished last turn (a trailing user message and a stopped or failed reply after it). */
export function unfinishedTurn(messages: ChatMessage[], text: string): string[] {
  const last = messages.at(-1);
  const prev = messages.at(-2);
  if (last?.role === 'user' && last.status === 'failed' && last.text === text) return [last.id];
  if (last?.role === 'assistant' && last.status !== 'complete' && prev?.role === 'user' && prev.text === text)
    return [prev.id, last.id];
  return [];
}
