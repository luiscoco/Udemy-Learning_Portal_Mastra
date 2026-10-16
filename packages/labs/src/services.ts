import type { RuntimeMode } from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';
import {
  checkModelId,
  getMastraVersion,
  liveModelCatalog,
  ScriptedLanguageModel,
  type LiveModelInfo,
  type ScriptedModelOptions,
} from '@mlp/mastra-runtime';

export interface ResolvedModel {
  /** Value to pass as `Agent.model`: a scripted LanguageModelV2 offline, a "provider/model" router id live. */
  model: ScriptedLanguageModel | string;
  /** Model id the learner selected. */
  modelId: string;
  /** True when no real provider is called (offline mode). */
  simulated: boolean;
  /** Present offline: inspect what the model received (system prompt, messages, tools). */
  scripted?: ScriptedLanguageModel;
}

export interface ModelService {
  /** Models offered for live runs (validated against the installed Mastra registry). */
  liveModels: LiveModelInfo[];
  /** Model ids learners can pick (live list, or defaults when nothing is configured). */
  selectableIds(): string[];
  resolve(opts: {
    mode: RuntimeMode;
    modelId: string;
    offline: ScriptedModelOptions['script'];
    tokenDelayMs?: number;
  }): ResolvedModel;
}

/**
 * Server-side adapters handed to every lab through RunContext.services.
 * Values never reach the client.
 */
export interface LabServices {
  readonly serverMode: RuntimeMode;
  readonly mastraVersion: string;
  readonly models: ModelService;
}

export interface LabServicesConfig {
  serverMode: RuntimeMode;
  /** Environment used only to check which provider keys exist (values are never read into results). */
  env?: Record<string, string | undefined>;
}

export function createModelService(env: Record<string, string | undefined>): ModelService {
  const { models: liveModels } = liveModelCatalog(env);
  return {
    liveModels,
    selectableIds: () => liveModels.map((m) => m.id),
    resolve({ mode, modelId, offline, tokenDelayMs }) {
      const check = checkModelId(modelId);
      if (!check.ok) throw new LabError('VALIDATION_FAILED', check.reason, { details: [{ path: 'input.modelId', message: check.reason }] });
      if (mode === 'offline') {
        const scripted = new ScriptedLanguageModel({ provider: 'offline-sim', modelId, script: offline, tokenDelayMs });
        return { model: scripted, modelId, simulated: true, scripted };
      }
      const info = liveModels.find((m) => m.id === modelId);
      if (!info) {
        throw new LabError(
          'NOT_CONFIGURED',
          `"${modelId}" is not enabled for live runs. Add it to LIVE_MODELS in .env (allowed now: ${liveModels.map((m) => m.id).join(', ')}).`,
        );
      }
      if (!info.configured) {
        throw new LabError('NOT_CONFIGURED', `Live mode needs ${info.apiKeyEnvVar} in the server .env to call ${modelId}.`);
      }
      return { model: modelId, modelId, simulated: false };
    },
  };
}

export function createLabServices(config: LabServicesConfig): LabServices {
  return {
    serverMode: config.serverMode,
    mastraVersion: getMastraVersion(),
    models: createModelService(config.env ?? {}),
  };
}
