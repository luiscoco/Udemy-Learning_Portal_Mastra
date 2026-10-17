import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type OpenedMemory, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { lab22Definition } from './definition.js';
import { createGuardedThreads, createRawThreads, type ThreadResult } from './guard.js';

export const USERS = ['alice', 'bob', 'carol'] as const;
export type User = (typeof USERS)[number];
const Ref = z.string().regex(/^\$\d{1,2}$/, 'Reference a created thread as $1, $2, …');
const As = z.enum(USERS);

export const OperationSchema = z.discriminatedUnion('op', [
  z.object({ as: As, op: z.literal('create'), title: z.string().trim().min(1).max(60) }),
  z.object({ as: As, op: z.literal('list') }),
  z.object({ as: As, op: z.literal('history'), thread: Ref }),
  z.object({ as: As, op: z.literal('send'), thread: Ref, text: z.string().trim().min(1).max(300) }),
  z.object({ as: As, op: z.literal('reset'), thread: Ref }),
  z.object({ as: As, op: z.literal('delete'), thread: Ref }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const Lab22InputSchema = z.object({
  operations: z.array(OperationSchema).min(1).max(14),
  strategy: z.enum(['guarded', 'raw-mastra']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab22Input = z.infer<typeof Lab22InputSchema>;

export interface StepResult {
  step: number;
  as: User;
  op: Operation['op'];
  thread?: string;
  /** Ground truth: who created the referenced thread ('none' for an unknown reference). */
  owner?: User | 'none';
  result: ThreadResult<unknown>;
}

export interface ThreadState {
  ref: string;
  owner: User;
  title: string;
  exists: boolean;
  userMessages: string[];
}

export interface Lab22Output {
  strategy: Lab22Input['strategy'];
  steps: StepResult[];
  threads: ThreadState[];
}

/** Offline model: a short acknowledgement that shows how much of the thread it can see. */
export function offlineScript() {
  return (v: PromptView): ScriptedTurn => ({
    text: `Noted. I can see ${v.userMessages.length} message(s) from you in this thread.`,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const lab22: LabImplementation<Lab22Input, Lab22Output, LabServices> = {
  definition: lab22Definition as LabDefinition,
  inputSchema: Lab22InputSchema,

  async run(ctx, input) {
    // Run-scoped identities keep every run's world separate inside the shared lab-22 database.
    const scope = ctx.runId.slice(0, 8);
    const resource = (u: User) => `${scope}:${u}`;
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    let opened: OpenedMemory | undefined;
    try {
      opened = await ctx.services.memory.open('lab-22', { lastMessages: 20 });
      const agent = withLabLogger(
        ctx,
        new Agent({
          id: 'notes-assistant',
          name: 'Notes Assistant',
          instructions: 'You keep travel notes for the signed-in user. Acknowledge each note in one short sentence.',
          model: resolved.model,
          memory: opened.memory,
        }),
      );
      const store =
        input.strategy === 'guarded'
          ? createGuardedThreads(opened.memory, agent, ctx.signal)
          : createRawThreads(opened.memory, agent, ctx.signal);
      ctx.log('info', `Strategy ${input.strategy}; identities are scoped to this run (${scope}:alice, ${scope}:bob, …).`);

      const created: { id: string; owner: User; title: string }[] = [];
      const steps: StepResult[] = [];
      for (const [i, op] of input.operations.entries()) {
        ctx.throwIfAborted();
        const ref = 'thread' in op ? op.thread : undefined;
        const target = ref ? created[Number(ref.slice(1)) - 1] : undefined;
        // An unknown reference becomes a random id that does not exist (exercises "not found").
        const threadId = ref ? (target?.id ?? randomUUID()) : '';
        const user = resource(op.as);
        let result: ThreadResult<unknown>;
        switch (op.op) {
          case 'create':
            result = await store.create(user, op.title);
            if (result.ok) created.push({ id: (result.data as { id: string }).id, owner: op.as, title: op.title });
            break;
          case 'list':
            result = await store.list(user);
            break;
          case 'history':
            result = await store.history(user, threadId);
            break;
          case 'send':
            result = await store.send(user, threadId, op.text);
            break;
          case 'reset':
            result = await store.reset(user, threadId);
            break;
          case 'delete':
            result = await store.delete(user, threadId);
            break;
        }
        // Results are shown with $n references instead of raw ids.
        const shown = JSON.parse(
          created
            .reduce((s, t, n) => s.split(t.id).join(`$${n + 1}`), JSON.stringify(result))
            .split(`${scope}:`)
            .join(''),
        ) as ThreadResult<unknown>;
        const owner = ref ? (target?.owner ?? 'none') : undefined;
        const denied = !result.ok;
        ctx.emit({
          type: 'workflow-step',
          stepId: `step-${i + 1}-${op.as}-${op.op}`,
          status: denied ? 'skipped' : 'success',
          output: { ok: result.ok, ...(ref ? { thread: ref, owner } : {}) },
        });
        steps.push({ step: i + 1, as: op.as, op: op.op, ...(ref ? { thread: ref, owner } : {}), result: shown });
      }

      // Final state, read with each thread's real owner (the "database view").
      const threads: ThreadState[] = [];
      for (const [n, t] of created.entries()) {
        const record = await opened.memory.getThreadById({ threadId: t.id });
        const userMessages = record
          ? (await opened.memory.recall({ threadId: t.id, resourceId: record.resourceId, perPage: false })).messages
              .filter((m) => m.role === 'user')
              .map((m) => m.content.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''))
          : [];
        threads.push({ ref: `$${n + 1}`, owner: t.owner, title: t.title, exists: Boolean(record), userMessages });
      }
      const idsAreUuids = created.every((t) => UUID.test(t.id));
      ctx.setResultExtras({
        effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, strategy: input.strategy },
        annotations: { threadsCreated: created.length, serverGeneratedIds: idsAreUuids },
      });
      return { strategy: input.strategy, steps, threads };
    } finally {
      await opened?.close();
    }
  },

  validate(out, input) {
    const foreign = out.steps.filter((s) => s.thread && s.owner !== s.as && s.owner !== 'none');
    const leakedReads = foreign.filter((s) => s.result.ok);
    // Replay only each owner's own operations to get the messages every thread should contain.
    const expected = new Map<string, { exists: boolean; texts: string[] }>();
    let n = 0;
    for (const op of input.operations) {
      if (op.op === 'create') expected.set(`$${++n}`, { exists: true, texts: [] });
      if (!('thread' in op)) continue;
      const t = out.threads.find((x) => x.ref === op.thread);
      const e = expected.get(op.thread);
      if (!t || !e || t.owner !== op.as || !e.exists) continue;
      if (op.op === 'send') e.texts.push(op.text);
      if (op.op === 'reset') e.texts = [];
      if (op.op === 'delete') e.exists = false;
    }
    const tampered = out.threads.filter((t) => {
      const e = expected.get(t.ref)!;
      return t.exists !== e.exists || JSON.stringify(t.userMessages) !== JSON.stringify(e.exists ? e.texts : []);
    });
    const lists = out.steps.filter((s) => s.op === 'list' && s.result.ok);
    const badLists = lists.filter((s) =>
      ((s.result as { data: { id: string }[] }).data ?? []).some((t) => out.threads.find((x) => x.ref === t.id)?.owner !== s.as),
    );
    const denials = out.steps.filter((s) => !s.result.ok).map((s) => JSON.stringify(s.result));
    const uniform = new Set(denials).size <= 1;
    const leaksIdentity = out.steps.some(
      (s) => !s.result.ok && USERS.some((u) => u !== s.as && JSON.stringify(s.result).includes(u)),
    );
    const resetOk = out.steps
      .filter((s) => s.op === 'reset' && s.owner === s.as && s.result.ok)
      .every((s) => out.threads.find((t) => t.ref === s.thread)?.exists !== false || expected.get(s.thread!)?.exists === false);
    return summarizeChecks([
      {
        id: 'no-cross-user-read',
        label: 'Every operation on another user’s thread was refused and returned no data',
        passed: leakedReads.length === 0,
        message: leakedReads.length
          ? `leaked at step ${leakedReads.map((s) => `${s.step} (${s.as} ${s.op} ${s.thread})`).join(', ')}`
          : `${foreign.length} cross-user attempt(s) refused`,
      },
      {
        id: 'no-cross-user-write',
        label: 'Every thread contains exactly what its owner wrote (no other user changed or deleted it)',
        passed: tampered.length === 0,
        message: tampered.length
          ? `changed by someone else: ${tampered.map((t) => t.ref).join(', ')}`
          : `${out.threads.length} thread(s) intact`,
      },
      {
        id: 'list-scoped',
        label: 'Listing threads only ever showed the caller’s own threads',
        passed: badLists.length === 0,
        message: `${lists.length} list call(s)`,
      },
      {
        id: 'no-enumeration',
        label: 'Refusals are identical and never name another user',
        passed: uniform && !leaksIdentity,
        message: denials.length ? (denials[0] ?? '') : 'no refusals',
      },
      {
        id: 'reset-safe',
        label: 'An owner’s reset kept the thread (id, title, owner) and emptied its messages',
        passed: resetOk,
        message: `${out.steps.filter((s) => s.op === 'reset' && s.owner === s.as).length} owner reset(s)`,
      },
    ]);
  },
};
