import type { RuntimeMode } from '@mlp/contracts';
import { LabError } from '@mlp/lab-engine';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  /**
   * Checks that a provider key is accepted, with the provider's free model-list endpoint (L72). Only the HTTP
   * status and the number of models come back: the key never leaves this service.
   */
  probeAuth(provider: ProbeProvider, signal: AbortSignal): Promise<ProviderProbe>;
}

export type ProbeProvider = 'openai' | 'anthropic';
export interface ProviderProbe {
  provider: ProbeProvider;
  configured: boolean;
  status: number | null;
  ok: boolean;
  models: number;
  ms: number;
}

/** Durable Mastra memory for labs: one SQLite file per name under <dataDir>/memory. */
export interface MemoryService {
  /** Absolute path of the database file for a name (its folder is created; the file is not). */
  file(name: string): string;
  /** Opens durable memory (optionally with a vector store and embedder); the caller must close() it. */
  open(name: string, options?: MemoryOptions, extras?: MemoryExtras): Promise<OpenedMemory>;
}

const STORE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function createMemoryService(baseDir: () => string = () => join(dataDir(), 'memory')): MemoryService {
  const file = (name: string) => {
    if (!STORE_NAME.test(name)) throw new LabError('VALIDATION_FAILED', `Invalid memory store name "${name}"`);
    // Partition folders (L62) are created on first use, so labs can open a store file directly.
    const dir = baseDir();
    mkdirSync(dir, { recursive: true });
    return join(dir, `${name}.db`);
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
  /** The storage partition every store of this services view lives in (L62). */
  readonly tenant: { readonly partition: string };
  /** A directory for plain files (not SQLite) inside this partition, e.g. files('comparisons'). */
  files(name: string): string;
  /**
   * The same services for another owner: every durable store (memory, library, datasets, workflow
   * snapshots, files) moves to that owner's partition. The runner calls it per run with the run owner.
   */
  forTenant(ownerId: string | null): LabServices;
  /**
   * Server-only key for keyed audit chains (L64): AUDIT_HMAC_KEY, or a key generated once into
   * <dataDir>/secrets/audit-hmac.key. Never stored next to a log and never sent to a client.
   */
  auditKey(): Buffer;
}

export interface LabServicesConfig {
  serverMode: RuntimeMode;
  /** Environment used only to check which provider keys exist (values are never read into results). */
  env?: Record<string, string | undefined>;
  /** Directory for memory databases (tests pass a temporary one). Defaults to <dataDir>/memory. */
  memoryDir?: string;
  /** Directory for server-generated secrets (tests may pass a temporary one). Defaults to <dataDir>/secrets. */
  secretsDir?: string;
}

/** Loads AUDIT_HMAC_KEY, or creates a random key file once. The value is never logged or returned to labs' outputs. */
export function loadAuditKey(env: Record<string, string | undefined>, secretsDir: string): Buffer {
  const configured = env.AUDIT_HMAC_KEY?.trim();
  if (configured) {
    if (configured.length < 32) throw new LabError('NOT_CONFIGURED', 'AUDIT_HMAC_KEY must be at least 32 characters.');
    return Buffer.from(configured, 'utf8');
  }
  const file = join(secretsDir, 'audit-hmac.key');
  if (!existsSync(file)) {
    mkdirSync(secretsDir, { recursive: true });
    try {
      writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (err) {
      // Another run created it first: use that one.
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
}

export function createModelService(env: Record<string, string | undefined>): ModelService {
  const { models: liveModels } = liveModelCatalog(env);
  return {
    liveModels,
    async probeAuth(provider, signal) {
      const key = provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
      const started = Date.now();
      if (!key) return { provider, configured: false, status: null, ok: false, models: 0, ms: 0 };
      const res = await fetch(
        provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://api.anthropic.com/v1/models?limit=100',
        {
          headers:
            provider === 'openai' ? { authorization: `Bearer ${key}` } : { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { data?: unknown[] };
      return {
        provider,
        configured: true,
        status: res.status,
        ok: res.ok,
        models: Array.isArray(body.data) ? body.data.length : 0,
        ms: Date.now() - started,
      };
    },
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

/** The partition of an owner: a fixed-length hash, so no raw identity (or ../) ever reaches a path. */
export function partitionOf(ownerId: string | null): string {
  if (ownerId === null) return 'local';
  return createHash('sha256').update(`tenant:${ownerId}`, 'utf8').digest('hex').slice(0, 24);
}

export const TENANTS_DIR = 'tenants';

/**
 * Server-side services. Every durable store lives under <memoryRoot>/tenants/<partition>/, so two
 * learners never share a store file, folder or record, whatever ids a lab uses inside its stores.
 * createLabServices() is the 'local' partition (runs without an owner: CLI, unit tests).
 */
export function createLabServices(config: LabServicesConfig): LabServices {
  const memoryRoot = () => config.memoryDir ?? join(dataDir(), 'memory');
  const models = createModelService(config.env ?? {});
  const mastraVersion = getMastraVersion();
  let key: Buffer | undefined;
  const auditKey = () => (key ??= loadAuditKey(config.env ?? {}, config.secretsDir ?? join(dataDir(), 'secrets')));
  const view = (ownerId: string | null): LabServices => {
    const partition = partitionOf(ownerId);
    const root = () => join(memoryRoot(), TENANTS_DIR, partition);
    return {
      serverMode: config.serverMode,
      mastraVersion,
      models,
      memory: createMemoryService(root),
      tenant: { partition },
      files(name: string) {
        if (!STORE_NAME.test(name)) throw new LabError('VALIDATION_FAILED', `Invalid file store name "${name}"`);
        return join(root(), 'files', name);
      },
      forTenant: view,
      auditKey,
    };
  };
  return view(null);
}
