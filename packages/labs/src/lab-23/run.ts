import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type OpenedMemory, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent, type ToolTrace } from '../shared/tool-stream.js';
import { lab23Definition } from './definition.js';
import { DIETS, PreferencesSchema, readProfile, updateProfile, type Preferences, type UpdateResult } from './profile.js';

export const Lab23InputSchema = z.object({
  messages: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
  settingsUpdates: z.array(z.record(z.string(), z.unknown())).max(6),
  validateDirectUpdates: z.boolean(),
  followUp: z.string().trim().min(1).max(400),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab23Input = z.infer<typeof Lab23InputSchema>;

export interface Lab23Output {
  conversation: { message: string; reply: string; toolCalls: { status: ToolTrace['status']; args: unknown; error?: string }[] }[];
  afterConversation: unknown;
  settingsUpdates: { patch: Record<string, unknown>; result: UpdateResult }[];
  followUp: { threadId: string; question: string; answer: string };
  /** Offline only: whether the follow-up's system prompt (new thread) carried the stored preferences. */
  followUpSawProfile: boolean | null;
  stored: unknown;
  storedValid: boolean;
}

/** Fields stated in one message, as the offline model understands them (partial, like a real model's update). */
export function extractPreferences(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const name = text.match(/\b(?:I'm|I am|my name is)\s+([A-Z][a-z]+)/)?.[1];
  if (name) out.name = name;
  const airport = text.match(/\b(?:from|airport is)\s+([A-Z]{3})\b/)?.[1];
  if (airport) out.homeAirport = airport;
  const seat = text.match(/\b(window|aisle)\s+seats?\b/i)?.[1] ?? text.match(/\bon the (\w+)\b/i)?.[1];
  if (seat) out.seat = seat.toLowerCase();
  const diets = DIETS.filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(text));
  if (diets.length) out.dietary = diets;
  return out;
}

/** Mastra prints an empty template first, then the stored record inside <working_memory_data>…</working_memory_data>. */
export function workingMemoryIn(system: string): Partial<Preferences> {
  const block = system.match(/<working_memory_data>\s*([\s\S]*?)\s*<\/working_memory_data>/)?.[1];
  if (!block) return {};
  try {
    return JSON.parse(block) as Partial<Preferences>;
  } catch {
    return {};
  }
}

/** Offline model: saves what each message states via updateWorkingMemory; answers the follow-up from working memory. */
export function offlineScript(sink: { followUpSystem: string | null }) {
  return (v: PromptView): ScriptedTurn => {
    // Only a tool result from THIS step counts (history also contains earlier turns' tool results).
    const midTurn = v.raw.at(-1)?.role === 'tool';
    const last = midTurn
      ? (v.toolResults.at(-1)?.output as { success?: boolean; error?: boolean; message?: string } | undefined)
      : undefined;
    if (last?.error)
      return { text: `I couldn’t save that: ${String(last.message).split('\n')[1]?.replace(/^- /, '') ?? 'invalid value'}.` };
    if (last?.success) return { text: 'Saved your preferences.' };
    if (/book|next flight/i.test(v.lastUser)) {
      sink.followUpSystem = v.system;
      const wm = workingMemoryIn(v.system);
      const meal = wm.dietary?.length ? wm.dietary.join(', ') : 'standard';
      return {
        text: `Flying from ${wm.homeAirport ?? 'your airport'}: I’ll request a ${wm.seat ?? 'any'} seat and a ${meal} meal${wm.name ? `, ${wm.name}` : ''}.`,
      };
    }
    const prefs = extractPreferences(v.lastUser);
    if (Object.keys(prefs).length === 0) return { text: 'Got it.' };
    return { toolCalls: [{ toolName: 'updateWorkingMemory', input: { memory: prefs } }] };
  };
}

export const lab23: LabImplementation<Lab23Input, Lab23Output, LabServices> = {
  definition: lab23Definition as LabDefinition,
  inputSchema: Lab23InputSchema,

  async run(ctx, input) {
    // Run-scoped user AND thread ids: a thread belongs to one resource, so fixed thread ids would collide across runs.
    const scope = ctx.runId.slice(0, 8);
    const resourceId = `${scope}:traveller`;
    const ids = { threadId: `${scope}:conversation-1`, resourceId };
    const sink = { followUpSystem: null as string | null };
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript(sink) });
    let opened: OpenedMemory | undefined;
    try {
      opened = await ctx.services.memory.open('lab-23', {
        lastMessages: 10,
        workingMemory: { enabled: true, scope: 'resource', schema: PreferencesSchema },
      });
      const agent = withLabLogger(
        ctx,
        new Agent({
          id: 'travel-concierge',
          name: 'Travel Concierge',
          instructions:
            'You are a travel concierge. Keep the user’s profile in working memory: save their name, home airport (IATA code), seat, dietary needs and currency when they state them. When booking, use the stored profile.',
          model: resolved.model,
          memory: opened.memory,
        }),
      );

      // 1. Conversation: the agent updates working memory through its tool (validated by Mastra).
      ctx.emit({ type: 'workflow-step', stepId: 'conversation-1', status: 'running' });
      const conversation: Lab23Output['conversation'] = [];
      for (const message of input.messages) {
        const r = await streamAgent(ctx, agent, message, {
          memory: { thread: ids.threadId, resource: resourceId },
          maxSteps: 3,
          emitTokens: false,
        });
        const toolCalls = r.tools
          .filter((t) => t.toolName === 'updateWorkingMemory')
          .map((t) => ({
            status: t.status,
            args: t.args,
            ...(t.error ? { error: t.error.split('\n')[1]?.replace(/^- /, '') ?? t.error } : {}),
          }));
        conversation.push({ message, reply: r.text, toolCalls });
      }
      const afterConversation = await readProfile(opened.memory, ids);
      ctx.emit({ type: 'workflow-step', stepId: 'conversation-1', status: 'success', output: { profile: afterConversation } });

      // 2. Direct updates (a settings page) through the ProfileService.
      ctx.emit({
        type: 'workflow-step',
        stepId: 'settings',
        status: 'running',
        input: { validate: input.validateDirectUpdates },
      });
      const settingsUpdates: Lab23Output['settingsUpdates'] = [];
      for (const patch of input.settingsUpdates) {
        const result = await updateProfile(opened.memory, ids, patch, { validate: input.validateDirectUpdates });
        ctx.log(
          result.ok ? 'info' : 'warn',
          `settings ${JSON.stringify(patch)} → ${result.ok ? 'applied' : result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
        );
        settingsUpdates.push({ patch, result });
      }
      ctx.emit({
        type: 'workflow-step',
        stepId: 'settings',
        status: 'success',
        output: { applied: settingsUpdates.filter((u) => u.result.ok).length },
      });

      // 3. The next conversation: a NEW thread for the same user.
      ctx.emit({ type: 'workflow-step', stepId: 'conversation-2', status: 'running' });
      const next = await streamAgent(ctx, agent, input.followUp, {
        memory: { thread: `${scope}:conversation-2`, resource: resourceId },
        maxSteps: 3,
        emitTokens: false,
      });
      ctx.emit({ type: 'workflow-step', stepId: 'conversation-2', status: 'success' });

      // 4. Retrieval.
      const stored = await readProfile(opened.memory, ids);
      const storedValid = PreferencesSchema.safeParse(stored).success;
      ctx.setResultExtras({
        effective: {
          mode: ctx.mode,
          modelId: input.modelId,
          simulated: resolved.simulated,
          scope: 'resource',
          validateDirectUpdates: input.validateDirectUpdates,
        },
      });
      const prefs = PreferencesSchema.safeParse(stored);
      return {
        conversation,
        afterConversation,
        settingsUpdates,
        followUp: { threadId: 'conversation-2', question: input.followUp, answer: next.text },
        followUpSawProfile:
          ctx.mode === 'offline' && sink.followUpSystem !== null && prefs.success
            ? Object.values(prefs.data).every((v) =>
                (Array.isArray(v) ? v : [v]).every((x) => sink.followUpSystem!.includes(String(x))),
              )
            : null,
        stored,
        storedValid,
      };
    } finally {
      await opened?.close();
    }
  },

  validate(out) {
    const stored = PreferencesSchema.safeParse(out.stored);
    const prefs: Preferences = stored.success ? stored.data : {};
    const answer = out.followUp.answer.toLowerCase();
    const expectedInAnswer = [prefs.seat, prefs.homeAirport, ...(prefs.dietary ?? [])].filter((x): x is string => Boolean(x));
    const toolRejected = out.conversation.flatMap((c) => c.toolCalls).filter((t) => t.status === 'invalid');
    const badSettings = out.settingsUpdates.filter((u) => !PreferencesSchema.partial().strict().safeParse(u.patch).success);
    const goodSettings = out.settingsUpdates.filter((u) => !badSettings.includes(u));
    const learned = PreferencesSchema.safeParse(out.afterConversation);
    const kept = learned.success
      ? Object.keys(learned.data).filter((k) => !(k in (stored.success ? stored.data : {})))
      : ['(conversation profile invalid)'];
    return summarizeChecks([
      {
        id: 'preference-survives',
        label: 'The next conversation (a new thread) used the stored preferences',
        passed:
          expectedInAnswer.length > 0 &&
          expectedInAnswer.every((x) => answer.includes(x.toLowerCase())) &&
          out.followUpSawProfile !== false,
        message: expectedInAnswer.length ? `expected in answer: ${expectedInAnswer.join(', ')}` : 'no stored preferences',
      },
      {
        id: 'tool-validated',
        label: 'Invalid updates the agent tried were rejected by the schema',
        passed: toolRejected.every((t) => t.error) && stored.success,
        message: toolRejected.length
          ? `${toolRejected.length} rejected: ${toolRejected.map((t) => t.error).join('; ')}`
          : 'the agent made no invalid update',
      },
      {
        id: 'direct-validated',
        label: 'Invalid settings updates were rejected with reasons; valid ones were applied',
        passed: badSettings.every((u) => !u.result.ok && u.result.errors.length > 0) && goodSettings.every((u) => u.result.ok),
        message: `${goodSettings.length} applied, ${badSettings.length} should be rejected`,
      },
      {
        id: 'stored-matches-schema',
        label: 'The stored profile passes the strict PreferencesSchema',
        passed: stored.success,
        message: stored.success
          ? JSON.stringify(stored.data)
          : stored.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
      {
        id: 'merge-not-replace',
        label: 'Later partial updates kept the fields learned earlier',
        passed: learned.success && kept.length === 0,
        message: kept.length ? `lost: ${kept.join(', ')}` : 'all earlier fields kept',
      },
    ]);
  },
};
