import { getProviderConfig, modelSupportsStructuredOutput, modelSupportsTemperature, parseModelString } from '@mastra/core/llm';

/**
 * Model ids offered in live mode unless LIVE_MODELS overrides them. Every id is checked against the
 * provider registry shipped with the installed @mastra/core, so an upgrade that drops one fails fast.
 */
export const DEFAULT_LIVE_MODELS = [
  'openai/gpt-5-mini',
  'openai/gpt-4o-mini',
  'anthropic/claude-haiku-4-5',
  'google/gemini-2.5-flash',
] as const;

/** Default model per provider used by scaffolding labs. */
export const DEFAULT_MODEL_BY_PROVIDER = {
  openai: 'openai/gpt-5-mini',
  anthropic: 'anthropic/claude-haiku-4-5',
  google: 'google/gemini-2.5-flash',
} as const;
export type ScaffoldProvider = keyof typeof DEFAULT_MODEL_BY_PROVIDER;

export type ModelCheck =
  | {
      ok: true;
      id: string;
      provider: string;
      modelId: string;
      apiKeyEnvVar: string;
      /** Every variable name the provider accepts (first is preferred). */
      apiKeyEnvVars: string[];
      supportsTemperature: boolean | undefined;
      supportsStructuredOutput: boolean | undefined;
    }
  | { ok: false; id: string; reason: string };

/** Validates a `provider/model` id against the installed Mastra provider registry. */
export function checkModelId(id: string): ModelCheck {
  if (!/^[\w.-]+\/[\w.:-]+$/.test(id)) {
    return { ok: false, id, reason: 'Model ids look like "provider/model", for example "openai/gpt-5-mini".' };
  }
  const { provider, modelId } = parseModelString(id);
  if (!provider) return { ok: false, id, reason: 'Missing provider prefix.' };
  const config = getProviderConfig(provider);
  if (!config) return { ok: false, id, reason: `Unknown provider "${provider}" in @mastra/core's model registry.` };
  const deprecated = (config as { deprecatedModels?: string[] }).deprecatedModels ?? [];
  if (deprecated.includes(modelId)) return { ok: false, id, reason: `"${id}" is deprecated by its provider.` };
  if (!config.models.includes(modelId)) {
    return { ok: false, id, reason: `"${modelId}" is not a known ${config.name ?? provider} model in this Mastra version.` };
  }
  const envVars = (Array.isArray(config.apiKeyEnvVar) ? config.apiKeyEnvVar : [config.apiKeyEnvVar]).filter(Boolean).map(String);
  return {
    ok: true,
    id,
    provider,
    modelId,
    apiKeyEnvVar: envVars[0] ?? '',
    apiKeyEnvVars: envVars,
    supportsTemperature: modelSupportsTemperature(id),
    supportsStructuredOutput: modelSupportsStructuredOutput(id),
  };
}

export interface LiveModelInfo {
  id: string;
  provider: string;
  apiKeyEnvVar: string;
  /** True when the provider key is present in the server environment (value never exposed). */
  configured: boolean;
  supportsTemperature: boolean | undefined;
  supportsStructuredOutput: boolean | undefined;
}

/** Parses LIVE_MODELS (comma separated) and keeps only ids valid in this Mastra version. */
export function liveModelCatalog(
  env: Record<string, string | undefined>,
  list: readonly string[] = env.LIVE_MODELS ? env.LIVE_MODELS.split(',') : DEFAULT_LIVE_MODELS,
): { models: LiveModelInfo[]; rejected: { id: string; reason: string }[] } {
  const models: LiveModelInfo[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const raw of list) {
    const id = raw.trim();
    if (!id) continue;
    const c = checkModelId(id);
    if (!c.ok) {
      rejected.push({ id, reason: c.reason });
      continue;
    }
    models.push({
      id,
      provider: c.provider,
      apiKeyEnvVar: c.apiKeyEnvVar,
      configured: c.apiKeyEnvVars.some((v) => Boolean(env[v])),
      supportsTemperature: c.supportsTemperature,
      supportsStructuredOutput: c.supportsStructuredOutput,
    });
  }
  return { models, rejected };
}
