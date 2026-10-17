import { getModelReasoningOptions, modelSupportsTemperature } from '@mastra/core/llm';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const MODELS = DEFAULT_LIVE_MODELS;
export type ModelId = (typeof MODELS)[number];

export const TEMPERATURES = ['provider-default', '0', '0.3', '0.7', '1'] as const;
export const EFFORT_ORDER = ['minimal', 'low', 'medium', 'high'] as const;
export const EFFORTS = ['provider-default', ...EFFORT_ORDER] as const;
export type Effort = (typeof EFFORTS)[number];

export interface ModelCapabilities {
  modelId: ModelId;
  provider: string;
  /** From modelSupportsTemperature(); unknown (undefined) is treated as unsupported. */
  temperature: boolean;
  /** Effort values the provider accepts, or [] when it has no effort control. */
  effort: string[];
  /** Reasoning controls the model has but this lab does not expose (they need coupled settings). */
  otherReasoningControls: string[];
}

/** Reads the installed Mastra provider registry: the single source for the UI, validation and results. */
export function capabilitiesOf(modelId: ModelId): ModelCapabilities {
  const reasoning = getModelReasoningOptions(modelId) ?? [];
  const effort = reasoning.flatMap((r) => (r.type === 'effort' ? ((r as { values?: string[] }).values ?? []) : []));
  return {
    modelId,
    provider: modelId.split('/')[0]!,
    temperature: modelSupportsTemperature(modelId) === true,
    effort: EFFORT_ORDER.filter((e) => effort.includes(e)),
    otherReasoningControls: reasoning.filter((r) => r.type !== 'effort').map((r) => r.type),
  };
}

export const CAPABILITIES = Object.fromEntries(MODELS.map((m) => [m, capabilitiesOf(m)])) as Record<ModelId, ModelCapabilities>;

export const modelsWhere = (pred: (c: ModelCapabilities) => boolean): string[] => MODELS.filter((m) => pred(CAPABILITIES[m]));
