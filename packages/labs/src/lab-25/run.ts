import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import {
  DEFAULT_LIVE_MODELS,
  ScriptedLanguageModel,
  type OpenedMemory,
  type PromptView,
  type ScriptedTurn,
} from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { lab25Definition } from './definition.js';
import { offlineObservations, probeObservationalMemory, statedFacts, type Capabilities } from './probe.js';

export const NATIVE_LABEL = 'native (Mastra Observational Memory)';
export const FALLBACK_LABEL = 'fallback (app-level, not Mastra observational memory)';

export const Lab25InputSchema = z.object({
  conversation: z.array(z.string().trim().min(1).max(600)).min(1).max(8),
  question: z.string().trim().min(1).max(300),
  expectedFact: z.string().trim().min(1).max(200),
  messageTokens: z.number().int().min(60).max(5_000),
  implementation: z.enum(['auto', 'native', 'fallback']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab25Input = z.infer<typeof Lab25InputSchema>;

export interface Lab25Output {
  capabilities: Capabilities;
  implementation: 'native' | 'fallback';
  label: string;
  messageTokens: number;
  estimatedHistoryTokens: number;
  /** Native: Mastra's active observations. Fallback: the app's notes. */
  observations: string | null;
  observedMessages: number;
  tokens: { observed: number | null; pending: number | null };
  observerCalls: number;
  answer: string;
  /** Offline only: whether the final call's system prompt carried the observations/notes. */
  injectedIntoPrompt: boolean | null;
}

/** ~4 characters per token: the same rough estimate the fallback uses to decide when to summarise. */
export const estimateTokens = (texts: string[]) => Math.ceil(texts.join(' ').length / 4);

/**
 * Text after the LAST <tag> (up to </tag> if present). Mastra's instructions mention the tags before
 * the data, and the injected <observations> block is not closed at the end of the system prompt.
 */
const block = (system: string, tag: string) => {
  const start = system.lastIndexOf(`<${tag}>`);
  if (start < 0) return '';
  const rest = system.slice(start + tag.length + 2);
  const end = rest.indexOf(`</${tag}>`);
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
};

/** Offline main model: short acknowledgements; answers the question from observations or notes in its prompt. */
export function offlineAgentScript(sink: { finalSystem: string | null }) {
  return (v: PromptView): ScriptedTurn => {
    if (!v.lastUser.includes('?')) return { text: 'Got it, thanks for telling me.' };
    sink.finalSystem = v.system;
    const notes = block(v.system, 'observations') || block(v.system, 'working_memory_data');
    const facts = notes
      .split('\n')
      .map((l) => l.replace(/^[*\-#\s🔴🟡]*(?:User stated:\s*)?/u, '').trim())
      .filter((l) => l && !/^No new facts|^Notes$/i.test(l));
    return { text: facts.length ? `From my notes about you: ${facts.join('; ')}.` : 'I have no notes about you yet.' };
  };
}

export const lab25: LabImplementation<Lab25Input, Lab25Output, LabServices> = {
  definition: lab25Definition as LabDefinition,
  inputSchema: Lab25InputSchema,

  async run(ctx, input) {
    const scope = ctx.runId.slice(0, 8);
    const ids = { thread: `${scope}:chat`, resource: `${scope}:learner` };
    const sink = { finalSystem: null as string | null };
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineAgentScript(sink) });
    let observerCalls = 0;
    // Offline Observer: a scripted model that writes observations from the transcript Mastra sends it.
    const observerModel =
      ctx.mode === 'offline'
        ? new ScriptedLanguageModel({
            modelId: 'observer-sim',
            script: (v) => {
              observerCalls += 1;
              return { text: `<observations>\n${offlineObservations(v.lastUser)}\n</observations>` };
            },
          })
        : input.modelId;

    let probeStore: OpenedMemory | undefined;
    let opened: OpenedMemory | undefined;
    try {
      probeStore = await ctx.services.memory.open('lab-25');
      const capabilities = probeObservationalMemory(probeStore.storage);
      await probeStore.close();
      probeStore = undefined;
      for (const r of capabilities.rows)
        ctx.log(r.available ? 'info' : 'warn', `capability ${r.name}: ${r.available ? 'yes' : 'no'} — ${r.evidence}`);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'probe',
        status: 'success',
        output: { nativeAvailable: capabilities.nativeAvailable },
      });

      if (input.implementation === 'native' && !capabilities.nativeAvailable)
        throw new LabError(
          'NOT_CONFIGURED',
          `Native Observational Memory is not available: ${capabilities.rows
            .filter((r) => !r.available)
            .map((r) => r.evidence)
            .join('; ')}`,
        );
      const implementation: 'native' | 'fallback' =
        input.implementation === 'fallback' || (input.implementation === 'auto' && !capabilities.nativeAvailable)
          ? 'fallback'
          : 'native';
      const label = implementation === 'native' ? NATIVE_LABEL : FALLBACK_LABEL;
      ctx.log(implementation === 'native' ? 'info' : 'warn', `Implementation: ${label}`);

      opened = await ctx.services.memory.open(
        'lab-25',
        implementation === 'native'
          ? {
              lastMessages: 20,
              observationalMemory: {
                model: observerModel,
                observation: { messageTokens: input.messageTokens, bufferTokens: false },
              },
            }
          : { lastMessages: 20, workingMemory: { enabled: true, scope: 'thread', template: '# Notes\n' } },
      );
      const agent = withLabLogger(
        ctx,
        new Agent({
          id: 'long-chat-assistant',
          name: 'Long Chat Assistant',
          instructions: 'You are a friendly assistant. Use what you have observed or noted about the user. Keep answers short.',
          model: resolved.model,
          memory: opened.memory,
        }),
      );

      ctx.emit({ type: 'workflow-step', stepId: 'conversation', status: 'running', input: { turns: input.conversation.length } });
      const said: string[] = [];
      let notes: string | null = null;
      for (const message of input.conversation) {
        const r = await agent.generate(message, { memory: ids, abortSignal: ctx.signal });
        ctx.throwIfAborted();
        said.push(message, r.text);
        // Fallback: when the estimated history passes the threshold, summarise it into notes (one call).
        if (implementation === 'fallback' && notes === null && estimateTokens(said) >= input.messageTokens) {
          observerCalls += 1;
          if (ctx.mode === 'offline') {
            notes = offlineObservations(said.filter((_, i) => i % 2 === 0).join('\n'));
          } else {
            const summarizer = new Agent({
              id: 'fallback-summarizer',
              name: 'Fallback Summarizer',
              instructions:
                'Summarise what the user stated about themselves as short bullet notes, one fact per line, starting with "* ". No commentary.',
              model: resolved.model,
            });
            notes = (await summarizer.generate(said.join('\n'), { abortSignal: ctx.signal })).text.trim();
          }
          await opened.memory.updateWorkingMemory({
            threadId: ids.thread,
            resourceId: ids.resource,
            workingMemory: `# Notes\n${notes}`,
          });
          ctx.log(
            'info',
            `fallback: history ≈ ${estimateTokens(said)} tokens ≥ ${input.messageTokens}; notes written to working memory`,
          );
        }
      }
      ctx.emit({ type: 'workflow-step', stepId: 'conversation', status: 'success' });

      ctx.emit({ type: 'workflow-step', stepId: 'question', status: 'running' });
      const answer = await agent.generate(input.question, { memory: ids, abortSignal: ctx.signal });
      ctx.throwIfAborted();
      ctx.emit({ type: 'workflow-step', stepId: 'question', status: 'success' });

      let observations: string | null = notes;
      let observedMessages = 0;
      const tokens: Lab25Output['tokens'] = { observed: null, pending: null };
      if (implementation === 'native') {
        const record = await opened.storage.stores.memory?.getObservationalMemory(ids.thread, ids.resource);
        observations = record?.activeObservations ?? null;
        observedMessages = record?.observedMessageIds?.length ?? 0;
        tokens.observed = record?.totalTokensObserved ?? null;
        tokens.pending = record?.pendingMessageTokens ?? null;
        if (ctx.mode !== 'offline' && observations) observerCalls = Math.max(observerCalls, 1);
      }
      const finalSystem = sink.finalSystem;
      ctx.setResultExtras({
        effective: {
          mode: ctx.mode,
          modelId: input.modelId,
          simulated: resolved.simulated,
          implementation: label,
          messageTokens: input.messageTokens,
          ...(implementation === 'native' ? { observation: { bufferTokens: false } } : {}),
        },
      });
      return {
        capabilities,
        implementation,
        label,
        messageTokens: input.messageTokens,
        estimatedHistoryTokens: estimateTokens(said),
        observations,
        observedMessages,
        tokens,
        observerCalls,
        answer: answer.text,
        injectedIntoPrompt:
          ctx.mode === 'offline' && finalSystem !== null
            ? Boolean(observations) && statedFacts(observations ?? '').some((f) => finalSystem.includes(f.replace(/[.!?]$/, '')))
            : null,
      };
    } finally {
      await probeStore?.close();
      await opened?.close();
    }
  },

  validate(out, input) {
    const keys = (input.expectedFact.toLowerCase().match(/[a-z]{5,}/g) ?? []).map((w) => w.replace(/(es|s)$/, ''));
    const has = (text: string | null) => Boolean(text) && keys.every((k) => text!.toLowerCase().includes(k));
    // Native runs are judged by Mastra's own token accounting; the fallback by the app's estimate.
    const honest =
      (out.implementation === 'native' && out.label === NATIVE_LABEL && out.capabilities.nativeAvailable) ||
      (out.implementation === 'fallback' &&
        out.label === FALLBACK_LABEL &&
        out.label.includes('not Mastra observational memory') &&
        out.observedMessages === 0 &&
        out.tokens.observed === null);
    const historyTokens =
      out.implementation === 'native' && out.tokens.pending !== null
        ? (out.tokens.observed ?? 0) + out.tokens.pending
        : out.estimatedHistoryTokens;
    const crossed = historyTokens >= input.messageTokens;
    return summarizeChecks([
      {
        id: 'capabilities-recorded',
        label: 'The capability probe recorded each check with evidence',
        passed: out.capabilities.rows.length >= 5 && out.capabilities.rows.every((r) => r.evidence.length > 0),
        message: out.capabilities.rows.map((r) => `${r.name}:${r.available ? 'yes' : 'no'}`).join(', '),
      },
      {
        id: 'labelled-honestly',
        label: 'The result is labelled with what really ran (a fallback is never presented as native)',
        passed: honest,
        message: out.label,
      },
      {
        id: 'threshold-respected',
        label: 'Observation ran exactly when the history passed the token threshold',
        passed: crossed === out.observerCalls > 0,
        message: `${out.implementation === 'native' ? 'Mastra counted' : 'app estimate ≈'} ${historyTokens} history tokens vs threshold ${input.messageTokens}; ${out.observerCalls} observer call(s)`,
      },
      {
        id: 'observations-created',
        label: 'The observations (or notes) contain the stated fact',
        passed: has(out.observations),
        message: out.observations ? out.observations.split('\n').slice(0, 3).join(' | ') : 'no observations',
      },
      {
        id: 'answer-uses-observations',
        label: 'The final answer uses the observed fact',
        passed: has(out.answer) && out.injectedIntoPrompt !== false,
        message: `looked for: ${keys.join(', ')}`,
      },
    ]);
  },
};
