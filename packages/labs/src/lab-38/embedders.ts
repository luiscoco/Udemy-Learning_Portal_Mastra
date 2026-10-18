import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { LabError } from '@mlp/lab-engine';
import { createConceptEmbedder } from '@mlp/mastra-runtime';

/**
 * Concept groups for the OFFLINE mock embedder over the course corpus: words in one group share a
 * dimension, so related wording lands close together (deterministic, not a real model). L39 reuses it.
 */
export const CORPUS_CONCEPTS: string[][] = [
  ['refund', 'refunds', 'reimburse', 'money', 'back', 'return', 'returned', 'credit'],
  ['ship', 'shipping', 'delivery', 'deliver', 'arrive', 'arrives', 'express', 'parcel', 'order', 'orders'],
  ['warranty', 'guarantee', 'defect', 'defects', 'broken', 'damage', 'repair', 'claim'],
  ['privacy', 'personal', 'data', 'gdpr', 'records', 'delete', 'deleted', 'retention', 'keep'],
  ['escalate', 'escalation', 'outage', 'incident', 'incidents', 'on-call', 'engineer', 'urgent'],
  ['payment', 'card', 'cards', 'billing', 'charge', 'invoice', 'dispute', 'disputes'],
  ['email', 'emails', 'marketing', 'newsletter', 'unsubscribe', 'opted'],
  ['days', 'day', 'business', 'months', 'years', 'hours', 'minutes', 'time'],
];

export const EMBEDDERS = [
  'default',
  'mock/concept-hash-64',
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
] as const;
export type EmbedderChoice = (typeof EMBEDDERS)[number];

const LIVE: Record<string, { dimensions: number; usdPerMillionTokens: number }> = {
  // List prices on 2026-10-18; check the provider's pricing page before relying on them.
  'openai/text-embedding-3-small': { dimensions: 1536, usdPerMillionTokens: 0.02 },
  'openai/text-embedding-3-large': { dimensions: 3072, usdPerMillionTokens: 0.13 },
};

export interface Embedder {
  id: string;
  simulated: boolean;
  dimensions: number;
  maxPerCall: number;
  usdPerMillionTokens: number;
  embed(values: string[], signal?: AbortSignal): Promise<{ embeddings: number[][]; tokens: number }>;
  /** The underlying Mastra embedding model (for tools such as createVectorQueryTool). */
  model(): EmbeddingModelV2<string>;
}

export function mockEmbedder(): Embedder {
  const model = createConceptEmbedder({ groups: CORPUS_CONCEPTS, dimensions: 64 });
  return {
    id: 'mock/concept-hash-64',
    simulated: true,
    dimensions: 64,
    maxPerCall: 256,
    usdPerMillionTokens: 0,
    async embed(values) {
      const r = await model.doEmbed({ values });
      return { embeddings: r.embeddings, tokens: 0 };
    },
    model: () => model,
  };
}

/**
 * Resolves the learner's choice. "default" is the mock offline and text-embedding-3-small live.
 * Offline mode never calls a provider, and live models need their provider key on the server.
 */
export function resolveEmbedder(
  choice: EmbedderChoice,
  opts: { mode: 'offline' | 'live'; openaiConfigured: boolean; dimensions: number },
): Embedder {
  const id = choice === 'default' ? (opts.mode === 'live' ? 'openai/text-embedding-3-small' : 'mock/concept-hash-64') : choice;
  if (id === 'mock/concept-hash-64') return mockEmbedder();
  if (opts.mode === 'offline')
    throw new LabError(
      'VALIDATION_FAILED',
      `Offline mode never calls a provider: choose "default" or the mock embedder instead of ${id}.`,
    );
  if (!opts.openaiConfigured) throw new LabError('NOT_CONFIGURED', `${id} needs OPENAI_API_KEY in the server .env.`);
  const info = LIVE[id]!;
  if (opts.dimensions > info.dimensions)
    throw new LabError('VALIDATION_FAILED', `${id} produces at most ${info.dimensions} dimensions.`);
  const dimensions = opts.dimensions || info.dimensions;
  // Constructed on first use: the router throws at construction when the provider key is missing.
  let model: ModelRouterEmbeddingModel | undefined;
  return {
    id,
    simulated: false,
    dimensions,
    maxPerCall: 2048,
    usdPerMillionTokens: info.usdPerMillionTokens,
    async embed(values, signal) {
      model ??= new ModelRouterEmbeddingModel(id);
      const r = await model.doEmbed({
        values,
        abortSignal: signal,
        ...(opts.dimensions ? { providerOptions: { openai: { dimensions } } } : {}),
      });
      return { embeddings: r.embeddings, tokens: r.usage?.tokens ?? 0 };
    },
    model: () => (model ??= new ModelRouterEmbeddingModel(id)),
  };
}

/** One index per embedder and dimension: vectors from different models must never be compared. */
export const indexNameFor = (e: Pick<Embedder, 'id' | 'dimensions'>) =>
  `l38_${e.id
    .replace(/^[a-z]+\//, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase()}_${e.dimensions}`;

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
