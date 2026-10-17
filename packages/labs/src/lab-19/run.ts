import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent } from '../shared/tool-stream.js';
import { lab19Definition } from './definition.js';
import { Lab19InputSchema, resolveOptions, type EffectiveOptions, type Lab19Input } from './options.js';

/** Mock city data for the lookup tool. */
export const PLACES = {
  Alfama: 'Lisbon’s oldest district: steep lanes, fado houses and views from Miradouro de Santa Luzia.',
  'Belém Tower': 'A 16th-century fortified tower on the Tagus, a UNESCO World Heritage site.',
  'LX Factory': 'A former textile complex turned into shops, cafés and a large bookshop.',
  'São Jorge Castle': 'A Moorish castle on the highest hill of the old town.',
} as const;
export type PlaceName = keyof typeof PLACES;
const PLACE_NAMES = Object.keys(PLACES) as [PlaceName, ...PlaceName[]];

export const placesIn = (prompt: string) => PLACE_NAMES.filter((p) => prompt.includes(p));

/** What one model call received (offline only: read from LanguageModelV2CallOptions). */
export interface CallOptionsSeen {
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: string;
}

export interface Lab19Output {
  effective: EffectiveOptions;
  stepsUsed: number;
  finishReason: string | null;
  limitsHit: ('maxSteps' | 'maxOutputTokens')[];
  lookups: string[];
  answer: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /** Offline only: the options each model call actually received. */
  modelSaw: CallOptionsSeen[];
}

/**
 * Offline model: one lookup per step (sequential), then a plan. It honours maxOutputTokens the way a
 * provider does (about 1.3 tokens per word): a too-small budget truncates with finishReason "length".
 */
export function offlineScript(prompt: string, seen: CallOptionsSeen[]) {
  const places = placesIn(prompt);
  return (v: PromptView): ScriptedTurn => {
    const po = v.options.providerOptions as Record<string, { reasoningEffort?: string }> | undefined;
    seen.push({
      ...(v.options.temperature !== undefined ? { temperature: v.options.temperature } : {}),
      ...(v.options.maxOutputTokens !== undefined ? { maxOutputTokens: v.options.maxOutputTokens } : {}),
      ...(po?.openai?.reasoningEffort ? { reasoningEffort: po.openai.reasoningEffort } : {}),
    });
    const done = v.toolResults.filter((r) => r.toolName === 'lookupPlace').length;
    if (done < places.length) return { toolCalls: [{ toolName: 'lookupPlace', input: { name: places[done]! } }] };
    const plan = [
      `Here is a ${places.length}-stop walk.`,
      ...places.map((p, i) => `Stop ${i + 1}, ${p}: ${PLACES[p]} Spend about forty minutes here before moving on.`),
      'Wear comfortable shoes, carry water, and use tram 28 or a short taxi ride between distant stops.',
    ].join(' ');
    const words = plan.split(/\s+/);
    const maxWords = Math.floor((v.options.maxOutputTokens ?? Infinity) / 1.3);
    return words.length > maxWords ? { text: words.slice(0, maxWords).join(' '), finishReason: 'length' } : { text: plan };
  };
}

export const lab19: LabImplementation<Lab19Input, Lab19Output, LabServices> = {
  definition: lab19Definition as LabDefinition,
  inputSchema: Lab19InputSchema,

  async run(ctx, input) {
    const effective = resolveOptions(input, ctx.deadline - Date.now());
    ctx.log('info', `Effective options: ${JSON.stringify({ ...effective, capabilities: undefined })}`);
    for (const o of effective.omitted) ctx.log('info', `Not sent: ${o.option} — ${o.reason}`);

    const modelSaw: CallOptionsSeen[] = [];
    const lookups: string[] = [];
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.prompt, modelSaw),
    });
    const lookupPlace = createTool({
      id: 'lookup-place',
      description: 'Looks up one Lisbon sight by name and returns a short description.',
      inputSchema: z.object({ name: z.enum(PLACE_NAMES) }),
      outputSchema: z.object({ name: z.string(), description: z.string() }),
      execute: async ({ name }) => {
        lookups.push(name);
        return { name, description: PLACES[name] };
      },
    });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'walk-planner',
        name: 'Walk Planner',
        model: resolved.model,
        instructions:
          'You plan city walks. Call lookupPlace once for every stop named by the user, then write the plan from the results in under 150 words.',
        tools: { lookupPlace },
      }),
    );

    ctx.emit({
      type: 'workflow-step',
      stepId: 'agent-loop',
      status: 'running',
      input: { maxSteps: effective.maxSteps, modelSettings: effective.modelSettings },
    });
    let res;
    try {
      res = await streamAgent(ctx, agent, input.prompt, {
        maxSteps: effective.maxSteps,
        modelSettings: effective.modelSettings,
        ...(effective.providerOptions ? { providerOptions: effective.providerOptions } : {}),
      });
    } catch (err) {
      ctx.throwIfAborted();
      if ((err as { name?: string }).name === 'MastraTimeoutError' || /timed out/i.test(String((err as Error).message)))
        throw new LabError(
          'TIMEOUT',
          `A model call exceeded the per-call timeout (${effective.modelSettings.timeout.stepMs} ms).`,
          { retryable: true },
        );
      throw err;
    }

    const limitsHit: Lab19Output['limitsHit'] = [];
    if (res.finishReason === 'tool-calls' && res.steps >= effective.maxSteps) limitsHit.push('maxSteps');
    if (res.finishReason === 'length') limitsHit.push('maxOutputTokens');
    for (const l of limitsHit) ctx.log('warn', `Limit reached: ${l} — the answer is incomplete.`);
    ctx.emit({
      type: 'workflow-step',
      stepId: 'agent-loop',
      status: limitsHit.length ? 'failed' : 'success',
      output: { steps: res.steps, finishReason: res.finishReason, limitsHit },
    });

    ctx.setResultExtras({
      effective: { mode: ctx.mode, simulated: resolved.simulated, ...effective, capabilities: undefined },
      ...(res.usage ? { usage: res.usage } : {}),
      annotations: { stepsUsed: res.steps, maxSteps: effective.maxSteps },
    });
    return {
      effective,
      stepsUsed: res.steps,
      finishReason: res.finishReason,
      limitsHit,
      lookups,
      answer: res.text,
      ...(res.usage ? { usage: res.usage } : {}),
      modelSaw,
    };
  },

  validate(out, input) {
    const e = out.effective;
    const caps = e.capabilities;
    const unsupported = [
      e.modelSettings.temperature !== undefined && !caps.temperature ? 'temperature' : null,
      e.providerOptions && caps.effort.length === 0 ? 'reasoningEffort' : null,
    ].filter(Boolean);
    const accounted =
      (e.modelSettings.temperature !== undefined) !==
        (e.omitted.some((o) => o.option === 'temperature') || e.providerDefaults.includes('temperature')) &&
      (e.providerOptions !== undefined) !==
        (e.omitted.some((o) => o.option === 'reasoningEffort') || e.providerDefaults.includes('reasoningEffort'));
    const expectedSeen = {
      ...(e.modelSettings.temperature !== undefined ? { temperature: e.modelSettings.temperature } : {}),
      maxOutputTokens: e.modelSettings.maxOutputTokens,
      ...(e.providerOptions ? { reasoningEffort: Object.values(e.providerOptions)[0]!.reasoningEffort } : {}),
    };
    const offline = out.modelSaw.length > 0;
    const callsMatch = out.modelSaw.every((s) => JSON.stringify(s) === JSON.stringify(expectedSeen));
    return summarizeChecks([
      {
        id: 'supported-only',
        label: 'Only options the model supports were sent',
        passed: unsupported.length === 0,
        message: `temperature ${caps.temperature ? 'supported' : 'not supported'}; effort ${caps.effort.join('/') || 'none'}`,
      },
      {
        id: 'effective-recorded',
        label: 'Every option is recorded as applied, omitted with a reason, or left to the provider default',
        passed: accounted && e.maxSteps === input.maxSteps && e.modelSettings.maxOutputTokens === input.maxOutputTokens,
        message: [
          `applied: maxSteps ${e.maxSteps}, maxOutputTokens ${e.modelSettings.maxOutputTokens}, stepMs ${e.modelSettings.timeout.stepMs}`,
          e.omitted.length ? `omitted: ${e.omitted.map((o) => o.option).join(', ')}` : '',
          e.providerDefaults.length ? `defaults: ${e.providerDefaults.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('; '),
      },
      {
        id: 'calls-match-effective',
        label: 'Every model call received exactly the effective settings',
        passed: !offline || callsMatch,
        message: offline
          ? `${out.modelSaw.length} call(s) checked`
          : 'live: options sent to the provider as recorded (not observable here)',
      },
      {
        id: 'steps-bounded',
        label: 'The agent loop stayed within maxSteps',
        passed: out.stepsUsed >= 1 && out.stepsUsed <= e.maxSteps,
        message: `${out.stepsUsed} of ${e.maxSteps} step(s)`,
      },
      {
        id: 'answer-complete',
        label: 'The run finished normally with a full answer (no limit hit)',
        passed: out.finishReason === 'stop' && out.answer.trim().length > 0 && out.limitsHit.length === 0,
        message: out.limitsHit.length ? `limit hit: ${out.limitsHit.join(', ')}` : `finish reason ${out.finishReason}`,
      },
    ]);
  },
};
