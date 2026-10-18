import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import type { MastraVector } from '@mastra/core/vector';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import {
  DEFAULT_LIVE_MODELS,
  InMemoryVector,
  openVectorStore,
  RecordingVector,
  type OpenedMemory,
  type PromptView,
  type ScriptedTurn,
} from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { withVectorStore } from '../shared/vector-store-lock.js';
import { lab24Definition } from './definition.js';
import { keywordsOf, LIVE_EMBEDDER, offlineEmbedder, rememberedUserLines } from './recall.js';

export const OTHER_USER_FACT = "I'm allergic to shellfish.";

export const Lab24InputSchema = z.object({
  history: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  question: z.string().trim().min(1).max(300),
  expectedFact: z.string().trim().min(1).max(300),
  semanticRecall: z.boolean(),
  // Hidden (not submitted) by the form when semanticRecall is off: defaults match the definition.
  topK: z.number().int().min(1).max(5).default(2),
  messageRange: z.number().int().min(0).max(2).default(0),
  scope: z.enum(['resource', 'thread']).default('resource'),
  lastMessages: z.number().int().min(1).max(10),
  vectorBackend: z.enum(['libsql', 'in-memory']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab24Input = z.infer<typeof Lab24InputSchema>;

export interface RecallHit {
  role: string;
  content: string;
  score: number;
  owner: 'you' | 'other user';
  thread: string;
}

export interface Lab24Output {
  embedder: string;
  vectorBackend: Lab24Input['vectorBackend'];
  vectorsStored: number;
  /** The semantic search Mastra ran for the question (null when recall is off). */
  questionQuery: { topK?: number; filter: unknown; hits: RecallHit[] } | null;
  recalledFact: boolean;
  /** Offline only: user lines Mastra injected as "remembered from a different conversation". */
  promptRemembered: string[] | null;
  answer: string;
}

/**
 * A hit "carries" the fact when it is this user's message (user OR assistant) containing the fact verbatim
 * or all of its key words. Assistant replies that restate a fact are embedded too, and with real
 * embeddings they often outrank the user's original wording.
 */
export function carriesFact(hit: RecallHit, fact: string): boolean {
  if (hit.owner !== 'you') return false;
  const text = hit.content.toLowerCase();
  return text.includes(fact.toLowerCase()) || keywordsOf(fact).every((k) => text.includes(k));
}

/** Offline model: acknowledges history; answers the question from what Mastra injected as remembered. */
export function offlineScript(sink: { remembered: string[] | null }) {
  return (v: PromptView): ScriptedTurn => {
    if (!v.lastUser.includes('?')) return { text: 'Noted.' };
    const remembered = rememberedUserLines(v.system);
    sink.remembered = remembered;
    return remembered.length
      ? {
          text: `From our earlier conversation I remember: ${remembered.map((r) => `“${r}”`).join(' ')} Keep that in mind for your plans.`,
        }
      : { text: 'I don’t remember anything relevant from earlier conversations.' };
  };
}

export const lab24: LabImplementation<Lab24Input, Lab24Output, LabServices> = {
  definition: lab24Definition as LabDefinition,
  inputSchema: Lab24InputSchema,

  async run(ctx, input) {
    const scope = ctx.runId.slice(0, 8);
    const me = `${scope}:learner`;
    const other = `${scope}:other-user`;
    const offline = ctx.mode === 'offline';
    if (!offline && !ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured))
      throw new LabError(
        'NOT_CONFIGURED',
        `Live semantic recall embeds with ${LIVE_EMBEDDER}; set OPENAI_API_KEY in the server .env.`,
      );

    const sink = { remembered: null as string[] | null };
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript(sink) });
    const embedderLabel = offline ? 'offline-sim/concept-embedder (stand-in, not a real model)' : LIVE_EMBEDDER;
    const vectorFile = ctx.services.memory.file(`lab-24-vectors-${offline ? 'offline' : 'openai'}`);
    const body = async () => {
      let inner: MastraVector | undefined;
      let opened: OpenedMemory | undefined;
      let recorder: RecordingVector | undefined;
      try {
        inner = input.vectorBackend === 'libsql' ? openVectorStore(vectorFile) : new InMemoryVector();
        recorder = new RecordingVector(inner);
        opened = await ctx.services.memory.open(
          'lab-24',
          {
            lastMessages: input.lastMessages,
            semanticRecall: input.semanticRecall
              ? { topK: input.topK, messageRange: input.messageRange, scope: input.scope }
              : false,
          },
          input.semanticRecall ? { vector: recorder, embedder: offline ? offlineEmbedder() : LIVE_EMBEDDER } : {},
        );
        const agent = withLabLogger(
          ctx,
          new Agent({
            id: 'memory-assistant',
            name: 'Memory Assistant',
            instructions:
              'You are a personal assistant. Use what you remember about the user when it is relevant. Keep answers short.',
            model: resolved.model,
            memory: opened.memory,
          }),
        );
        const say = (text: string, thread: string, resource: string) =>
          agent.generate(text, { memory: { thread: `${scope}:${thread}`, resource }, abortSignal: ctx.signal });

        ctx.emit({
          type: 'workflow-step',
          stepId: 'store-history',
          status: 'running',
          input: { messages: input.history.length },
        });
        recorder.label = 'history';
        await say(OTHER_USER_FACT, 'other-chat', other); // a different user with a similar fact
        for (const text of input.history) {
          await say(text, 'earlier-chat', me);
          ctx.throwIfAborted();
        }
        ctx.emit({
          type: 'workflow-step',
          stepId: 'store-history',
          status: 'success',
          output: { vectorsStored: recorder.upserts },
        });

        ctx.emit({ type: 'workflow-step', stepId: 'ask-in-new-thread', status: 'running' });
        recorder.label = 'question';
        const res = await say(input.question, 'new-chat', me);
        ctx.throwIfAborted();
        const q = recorder.queries.filter((x) => x.label === 'question').at(-1);
        const strip = (s: unknown) => String(s ?? '').replace(`${scope}:`, '');
        const hits: RecallHit[] = (q?.hits ?? []).map((h) => ({
          role: String(h.metadata?.role ?? '?'),
          content: String(h.metadata?.content ?? ''),
          score: h.score,
          owner: h.metadata?.resource_id === me ? 'you' : 'other user',
          thread: strip(h.metadata?.thread_id),
        }));
        for (const h of hits)
          ctx.log('info', `recall hit (${h.score.toFixed(3)}) ${h.owner} / ${h.thread}: ${h.content.slice(0, 80)}`);
        ctx.emit({
          type: 'workflow-step',
          stepId: 'ask-in-new-thread',
          status: 'success',
          output: { hits: hits.length },
          annotations: { topK: input.topK, scope: input.scope },
        });

        const recalledFact = hits.some((h) => carriesFact(h, input.expectedFact));
        ctx.setResultExtras({
          effective: {
            mode: ctx.mode,
            modelId: input.modelId,
            simulated: resolved.simulated,
            embedder: embedderLabel,
            vectorBackend: input.vectorBackend,
            semanticRecall: input.semanticRecall
              ? { topK: input.topK, messageRange: input.messageRange, scope: input.scope }
              : false,
            lastMessages: input.lastMessages,
          },
        });
        return {
          embedder: embedderLabel,
          vectorBackend: input.vectorBackend,
          vectorsStored: recorder.upserts,
          questionQuery: q
            ? {
                topK: q.topK,
                filter: JSON.parse(
                  JSON.stringify(q.filter ?? {})
                    .split(`${scope}:`)
                    .join(''),
                ) as unknown,
                hits,
              }
            : null,
          recalledFact,
          promptRemembered: offline ? sink.remembered : null,
          answer: res.text,
        };
      } finally {
        // This run's vectors are scoped to it; removing them keeps the shared store from growing forever.
        await recorder?.deleteWritten().catch(() => {});
        await opened?.close();
        if (inner && 'close' in inner && typeof (inner as { close?: unknown }).close === 'function')
          await (inner as unknown as { close(): Promise<void> }).close();
      }
    };
    return input.vectorBackend === 'libsql' ? withVectorStore(vectorFile, body, ctx.signal) : body();
  },

  validate(out, input) {
    const hits = out.questionQuery?.hits ?? [];
    const keywords = keywordsOf(input.expectedFact);
    const answer = out.answer.toLowerCase();
    return summarizeChecks([
      {
        id: 'older-fact-recalled',
        label: 'Semantic search for the question returned the older relevant fact',
        passed: out.recalledFact,
        message: out.questionQuery
          ? `${hits.length} hit(s): ${hits.map((h) => h.content.slice(0, 40)).join(' | ')}`
          : 'semantic recall is off: no search was made',
      },
      {
        id: 'from-another-thread',
        label: 'The fact came from an earlier conversation, not the current thread’s recent messages',
        passed: hits.some((h) => carriesFact(h, input.expectedFact) && h.thread !== 'new-chat'),
        message: `question asked in a new thread; lastMessages = ${input.lastMessages}`,
      },
      {
        id: 'scoped-to-user',
        label: 'No recalled message belongs to another user',
        passed: hits.every((h) => h.owner === 'you') && !answer.includes('shellfish'),
        message: `filter: ${JSON.stringify(out.questionQuery?.filter ?? null)}`,
      },
      {
        id: 'top-k-respected',
        label: 'The search returned at most topK hits',
        passed: hits.length <= input.topK,
        message: `${hits.length} of topK ${input.topK}`,
      },
      {
        id: 'answer-uses-fact',
        label: 'The answer uses the recalled fact',
        passed: keywords.some((k) => answer.includes(k)),
        message: `looked for: ${keywords.join(', ')}`,
      },
    ]);
  },
};
