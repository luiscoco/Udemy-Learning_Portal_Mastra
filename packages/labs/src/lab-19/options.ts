import { z } from 'zod';
import { CAPABILITIES, EFFORTS, MODELS, TEMPERATURES, type ModelCapabilities } from './capabilities.js';

export const Lab19InputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(1_000),
    modelId: z.enum(MODELS),
    /** Only offered (and only accepted) for models that support temperature. */
    temperature: z.enum(TEMPERATURES).optional(),
    /** Only offered (and only accepted) for models with an effort-type reasoning control. */
    reasoningEffort: z.enum(EFFORTS).optional(),
    maxOutputTokens: z.number().int().min(64).max(2_000),
    maxSteps: z.number().int().min(1).max(6),
    stepTimeoutMs: z.number().int().min(1_000).max(60_000),
  })
  .superRefine((input, ctx) => {
    // The server enforces exactly what the UI offers, so a hand-written API call cannot slip past it.
    const caps = CAPABILITIES[input.modelId];
    if (input.temperature !== undefined && !caps.temperature) {
      ctx.addIssue({ code: 'custom', path: ['temperature'], message: `${input.modelId} does not support temperature` });
    }
    if (
      input.reasoningEffort !== undefined &&
      input.reasoningEffort !== 'provider-default' &&
      !caps.effort.includes(input.reasoningEffort)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['reasoningEffort'],
        message: caps.effort.length
          ? `${input.modelId} accepts reasoning effort ${caps.effort.join(', ')}`
          : `${input.modelId} has no reasoning-effort control`,
      });
    }
  });
export type Lab19Input = z.infer<typeof Lab19InputSchema>;

export interface EffectiveOptions {
  modelId: string;
  maxSteps: number;
  modelSettings: { maxOutputTokens: number; temperature?: number; timeout: { stepMs: number } };
  providerOptions?: Record<string, Record<string, string>>;
  /** Options not sent, and why. */
  omitted: { option: string; reason: string }[];
  /** Options deliberately left to the provider's default. */
  providerDefaults: string[];
  /** Values reduced to fit a server limit. */
  clamped: { option: string; requested: number; applied: number; reason: string }[];
  capabilities: ModelCapabilities;
}

/** Turns validated input into the exact options passed to agent.generate/stream, recording every decision. */
export function resolveOptions(input: Lab19Input, remainingRunMs: number): EffectiveOptions {
  const caps = CAPABILITIES[input.modelId];
  const omitted: EffectiveOptions['omitted'] = [];
  const providerDefaults: string[] = [];
  const clamped: EffectiveOptions['clamped'] = [];

  const modelSettings: EffectiveOptions['modelSettings'] = {
    maxOutputTokens: input.maxOutputTokens,
    timeout: { stepMs: input.stepTimeoutMs },
  };
  // Leave headroom so the run deadline, not a step timer, reports an overall timeout.
  const stepCap = Math.max(1_000, remainingRunMs - 1_000);
  if (input.stepTimeoutMs > stepCap) {
    modelSettings.timeout.stepMs = stepCap;
    clamped.push({
      option: 'stepTimeoutMs',
      requested: input.stepTimeoutMs,
      applied: stepCap,
      reason: 'cannot exceed the remaining run time',
    });
  }

  if (!caps.temperature)
    omitted.push({ option: 'temperature', reason: `not supported by ${input.modelId} (Mastra provider registry)` });
  else if (input.temperature === undefined || input.temperature === 'provider-default') providerDefaults.push('temperature');
  else modelSettings.temperature = Number(input.temperature);

  let providerOptions: EffectiveOptions['providerOptions'];
  if (caps.effort.length === 0) {
    omitted.push({ option: 'reasoningEffort', reason: `${input.modelId} has no reasoning-effort control` });
  } else if (input.reasoningEffort === undefined || input.reasoningEffort === 'provider-default') {
    providerDefaults.push('reasoningEffort');
  } else {
    providerOptions = { [caps.provider]: { reasoningEffort: input.reasoningEffort } };
  }
  for (const control of caps.otherReasoningControls)
    omitted.push({ option: `reasoning (${control})`, reason: 'available for this model but not exposed in this lab' });

  return {
    modelId: input.modelId,
    maxSteps: input.maxSteps,
    modelSettings,
    ...(providerOptions ? { providerOptions } : {}),
    omitted,
    providerDefaults,
    clamped,
    capabilities: caps,
  };
}
