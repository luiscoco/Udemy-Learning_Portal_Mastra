import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition, type WorkspaceTurn } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { consumeStream } from '../shared/tool-stream.js';
import { courseLibrary } from '../lab-36/library.js';
import { tokenize } from '../lab-42/hybrid.js';
import { guardClaims, parseClaims, type SourcePassage } from '../lab-44/claims.js';
import { RESOURCE, storedMessages, textOf } from '../lab-67/transcript.js';
import { lab70Definition } from './definition.js';
import { documentsOf, passagesOf, SAMPLE_HASHES, seedSamples } from './knowledge.js';
import { createWorkspaceTools, type Task } from './tools.js';

const STORE = 'lab-70-workspace';
const lock = new KeyedLock();

export const Lab70InputSchema = z
  .object({
    action: z.enum(['send', 'history', 'seed']),
    threadId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/, 'Use 3–41 lowercase letters, digits or dashes'),
    message: z.string().trim().max(1_000).default(''),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  .refine((v) => v.action !== 'send' || v.message.length > 0, { message: 'Type a question to send', path: ['message'] });
export type Lab70Input = z.infer<typeof Lab70InputSchema>;

export interface Lab70Output {
  action: Lab70Input['action'];
  workspace: WorkspaceTurn;
  /** Passages searchDocs returned this turn (the citation guard's ground truth). */
  retrieved: { id: string; source: string }[];
  blocked: number;
}

export const INSTRUCTIONS = `You are a support assistant with a knowledge base.
1. First call planTasks with 3 short tasks for this question.
2. Do the tasks in order, calling completeTask(n) as each one is done. Use searchDocs to find facts; never answer from memory.
3. Finally reply with JSON only: {"claims": [{"text": "<one fact>", "citations": [{"id": "<passage id from searchDocs>", "quote": "<sentence copied exactly from that passage>"}]}]}
Every claim cites a passage returned by searchDocs, quoted verbatim. If the documents do not answer the question, reply {"claims": []}.`;

const TASKS = ['Search the knowledge base', 'Read the relevant passages', 'Write a cited answer'];
const firstSentence = (t: string) => (t.match(/^[^.!?]+[.!?]/)?.[0] ?? t).trim();

/** Offline workspace model: plans, searches, completes each task, then answers with exact quotes. */
export function workspaceScript() {
  return (v: PromptView): ScriptedTurn => {
    // Only this turn's tool results: earlier turns on the thread are in the prompt too (memory).
    const lastUser = v.raw.map((m) => m.role).lastIndexOf('user');
    const thisTurn = v.raw
      .slice(lastUser + 1)
      .flatMap((m) => (m.role === 'tool' ? m.content.filter((c) => c.type === 'tool-result') : [])).length;
    const results = thisTurn > 0 ? v.toolResults.slice(-thisTurn) : [];
    const done = (name: string) => results.some((r) => r.toolName === name);
    if (!done('planTasks')) return { toolCalls: [{ toolName: 'planTasks', input: { tasks: TASKS } }] };
    if (!done('searchDocs'))
      return {
        toolCalls: [
          { toolName: 'completeTask', input: { n: 1 } },
          { toolName: 'searchDocs', input: { query: v.lastUser } },
        ],
      };
    if (results.filter((r) => r.toolName === 'completeTask').length < 3)
      return {
        toolCalls: [
          { toolName: 'completeTask', input: { n: 2 } },
          { toolName: 'completeTask', input: { n: 3 } },
        ],
      };
    const q = new Set(tokenize(v.lastUser));
    const found =
      (results.find((r) => r.toolName === 'searchDocs')?.output as { passages?: { id: string; text: string }[] })?.passages ?? [];
    const claims = found
      .filter((p) => tokenize(p.text).some((t) => q.has(t)))
      .slice(0, 2)
      .map((p) => ({ text: firstSentence(p.text), citations: [{ id: p.id, quote: firstSentence(p.text) }] }));
    return { text: JSON.stringify({ claims }) };
  };
}

/** A stored assistant message holds the claims JSON; show its claim texts. */
const displayText = (role: string, text: string) => {
  if (role !== 'assistant') return text;
  const c = parseClaims(text);
  return c ? c.claims.map((x) => x.text).join(' ') || 'The documents do not answer that.' : text;
};

export const lab70: LabImplementation<Lab70Input, Lab70Output, LabServices> = {
  definition: lab70Definition as LabDefinition,
  inputSchema: Lab70InputSchema,
  async run(ctx, input) {
    return lock.run(`${ctx.services.tenant.partition}:${input.threadId}`, () => turn(ctx, input), ctx.signal);
  },

  validate(out, input, { events }) {
    const w = out.workspace;
    if (out.action !== 'send')
      return summarizeChecks([
        {
          id: 'documents-seeded',
          label: 'The sample documents are in your own knowledge library',
          passed: out.action === 'history' || w.documents.filter((d) => d.sample).length === 3,
          message:
            out.action === 'seed'
              ? `${w.seeded?.added ?? 0} added, ${w.seeded?.existing ?? 0} already there`
              : `${w.documents.length} document(s)`,
        },
      ]);
    const taskSteps = events.filter((e) => e.type === 'workflow-step' && e.stepId.startsWith('task:'));
    const runningFirst = w.tasks.every((t) => {
      const mine = taskSteps
        .filter((e) => e.type === 'workflow-step' && e.stepId === `task:${t.n}`)
        .map((e) => (e.type === 'workflow-step' ? e.status : ''));
      return mine.indexOf('running') >= 0 && mine.indexOf('running') < mine.lastIndexOf('success');
    });
    const searches = events.filter((e) => e.type === 'tool-start' && e.toolName === 'searchDocs').length;
    const shown = w.citedAnswer?.claims ?? [];
    const retrieved = new Set(out.retrieved.map((r) => r.id));
    const myNames = new Set(w.documents.map((d) => d.name));
    const last = w.messages.at(-1);
    const user = w.messages.at(-2);
    return summarizeChecks([
      {
        id: 'documents-seeded',
        label: 'The answer drew on your knowledge documents, or honestly said there were none',
        passed: w.documents.length > 0 || shown.length === 0,
        message: w.documents.length
          ? `${w.documents.length} document(s) in your library`
          : 'no documents yet: seed the samples first',
      },
      {
        id: 'tasks-progressed',
        label: 'Every planned task was shown running and then done',
        passed: w.tasks.length > 0 && w.tasks.every((t) => t.status === 'done') && runningFirst,
        message: w.tasks.map((t) => `${t.n}. ${t.title}: ${t.status}`).join('; ') || 'no tasks planned',
      },
      {
        id: 'tools-used',
        label: 'The agent searched the documents before answering',
        passed: searches > 0,
        message: `${searches} search(es), ${out.retrieved.length} passage(s) retrieved`,
      },
      {
        id: 'citations-verified',
        label: 'Every shown claim quotes a passage retrieved in this turn',
        passed:
          shown.every((c) =>
            c.citations.every(
              (ct) => retrieved.has(ct.sourceId) && (w.citedAnswer!.sources[ct.sourceId]?.text ?? '').includes(ct.quote),
            ),
          ) &&
          (shown.length > 0 ||
            out.retrieved.length === 0 ||
            out.blocked > 0 ||
            displayText('assistant', '{"claims":[]}') === (last?.text ?? '')),
        message: `${shown.length} claim(s) shown, ${out.blocked} blocked`,
      },
      {
        id: 'history-persisted',
        label: 'The thread ends with your question and the answer',
        passed: user?.role === 'user' && user.text === input.message && last?.role === 'assistant',
        message: `${w.messages.length} message(s) in ${w.threadId}`,
      },
      {
        id: 'no-cross-learner-docs',
        label: 'Only your own documents were searched',
        passed: out.retrieved.every((r) => myNames.has(r.source)),
        message: out.retrieved.map((r) => r.id).join(', ') || 'nothing retrieved',
      },
    ]);
  },
};

async function turn(ctx: RunContext<LabServices>, input: Lab70Input): Promise<Lab70Output> {
  const library = courseLibrary(ctx.services); // in this learner's partition (L62)
  const seeded = input.action === 'seed' ? seedSamples(library) : undefined;
  const docs = documentsOf(library);
  const documents = docs.map((d) => ({
    docId: d.docId,
    name: d.name,
    chars: d.chars,
    sample: SAMPLE_HASHES.has(d.sha256),
    preview: d.text.slice(0, 4_000),
  }));
  const opened = await ctx.services.memory.open(STORE, { lastMessages: 10 });
  try {
    const messagesOf = async () =>
      (await storedMessages(opened, input.threadId))
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          text: displayText(m.role, textOf(m)).slice(0, 20_000),
          createdAt: new Date(m.createdAt).toISOString(),
        }));
    if (input.action !== 'send')
      return {
        action: input.action,
        workspace: {
          threadId: input.threadId,
          documents,
          messages: await messagesOf(),
          tasks: [],
          ...(seeded ? { seeded } : {}),
        },
        retrieved: [],
        blocked: 0,
      };

    const retrieved = new Map<string, SourcePassage>();
    const tasks: Task[] = [];
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: workspaceScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'lab70-workspace',
        name: 'Workspace assistant',
        instructions: INSTRUCTIONS,
        model: resolved.model as never,
        memory: opened.memory,
        tools: createWorkspaceTools({ ctx, passages: passagesOf(docs), retrieved, tasks }),
      }),
    );
    const stream = await agent.stream(input.message, {
      memory: { thread: input.threadId, resource: RESOURCE },
      maxSteps: 8,
      abortSignal: ctx.signal,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await consumeStream(ctx, stream as any, { emitTokens: false });
    const guarded = guardClaims(res.text, [...retrieved.values()], { enforce: true });
    const blocked = guarded.verdicts.filter((v) => !v.accepted).length;
    if (blocked) ctx.log('warn', `${blocked} claim(s) blocked: their quotes are not in the retrieved passages`);
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated } });
    return {
      action: 'send',
      workspace: {
        threadId: input.threadId,
        documents,
        messages: await messagesOf(),
        citedAnswer: guarded.citedAnswer,
        tasks: tasks.map((t) => ({ ...t })),
      },
      retrieved: [...retrieved.values()].map((p) => ({ id: p.id, source: p.title })),
      blocked,
    };
  } finally {
    await opened.close();
  }
}
