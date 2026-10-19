import type { RuntimeMode } from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';
import { join } from 'node:path';
import {
  checkModelId,
  getMastraVersion,
  liveModelCatalog,
  openMemory,
  ScriptedLanguageModel,
  type LiveModelInfo,
  type MemoryExtras,
  type MemoryOptions,
  type OpenedMemory,
  type ScriptedModelOptions,
} from '@mlp/mastra-runtime';
import { dataDir } from './paths.js';

/** Provider name of the offline mock models (the scripted models labs use in offline mode). */
export const OFFLINE_PROVIDER = 'offline-sim';

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

/** Durable Mastra memory for labs: one SQLite file per name under <dataDir>/memory. */
export interface MemoryService {
  /** Absolute path of the database file for a name (no file is created). */
  file(name: string): string;
  /** Opens durable memory (optionally with a vector store and embedder); the caller must close() it. */
  open(name: string, options?: MemoryOptions, extras?: MemoryExtras): Promise<OpenedMemory>;
}

const STORE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function createMemoryService(baseDir: () => string = () => join(dataDir(), 'memory')): MemoryService {
  const file = (name: string) => {
    if (!STORE_NAME.test(name)) throw new LabError('VALIDATION_FAILED', `Invalid memory store name "${name}"`);
    return join(baseDir(), `${name}.db`);
  };
  return { file, open: (name, options, extras) => openMemory(file(name), options, extras) };
}

/**
 * Server-side adapters handed to every lab through RunContext.services.
 * Values never reach the client.
 */
export interface LabServices {
  readonly serverMode: RuntimeMode;
  readonly mastraVersion: string;
  readonly models: ModelService;
  readonly memory: MemoryService;
}

export interface LabServicesConfig {
  serverMode: RuntimeMode;
  /** Environment used only to check which provider keys exist (values are never read into results). */
  env?: Record<string, string | undefined>;
  /** Directory for memory databases (tests pass a temporary one). Defaults to <dataDir>/memory. */
  memoryDir?: string;
}

export function createModelService(env: Record<string, string | undefined>): ModelService {
  const { models: liveModels } = liveModelCatalog(env);
  return {
    liveModels,
    selectableIds: () => liveModels.map((m) => m.id),
    resolve({ mode, modelId, offline, tokenDelayMs }) {
      const check = checkModelId(modelId);
      if (!check.ok)
        throw new LabError('VALIDATION_FAILED', check.reason, { details: [{ path: 'input.modelId', message: check.reason }] });
      if (mode === 'offline') {
        const scripted = new ScriptedLanguageModel({ provider: OFFLINE_PROVIDER, modelId, script: offline, tokenDelayMs });
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
    memory: createMemoryService(config.memoryDir ? () => config.memoryDir! : undefined),
  };
}
