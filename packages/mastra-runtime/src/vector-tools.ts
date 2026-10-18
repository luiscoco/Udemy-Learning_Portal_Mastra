import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { createClient } from '@libsql/client';
import { LibSQLVector } from '@mastra/libsql';
import {
  MastraVector,
  type CreateIndexParams,
  type DeleteIndexParams,
  type DeleteVectorParams,
  type DeleteVectorsParams,
  type DescribeIndexParams,
  type IndexStats,
  type QueryResult,
  type QueryVectorParams,
  type UpdateVectorParams,
  type UpsertVectorParams,
} from '@mastra/core/vector';
import { fileUrl } from './memory-store.js';

/** A durable vector store on a local SQLite file (via @mastra/libsql). */
export function openVectorStore(file: string): LibSQLVector {
  mkdirSync(dirname(file), { recursive: true });
  return new LibSQLVector({ id: 'mlp-vectors', url: fileUrl(file) });
}

/**
 * A durable libSQL vector store that searches EXACTLY (brute-force cosine, filters applied in SQL before
 * ranking) instead of through libSQL's approximate index (vector_top_k).
 *
 * Why (verified on @mastra/libsql 1.26.2): the approximate index filters AFTER its nearest-neighbour
 * search, misses vectors under concurrent writers, and degraded after repeated in-place upserts (a
 * record stopped being its own top hit). LibSQLVector falls back to exact search when a table has no
 * `<index>_vector_idx`, so this creates the requested tables, drops those approximate indexes with plain
 * SQL, and returns a fresh store. Exact search is the right choice for course-sized stores (hundreds of
 * vectors); large production stores need a server-side vector database instead.
 */
export async function openExactVectorStore(file: string, indexes: { indexName: string; dimension: number }[] = []): Promise<LibSQLVector> {
  mkdirSync(dirname(file), { recursive: true });
  const url = fileUrl(file);
  const setup = new LibSQLVector({ id: 'mlp-vectors-setup', url });
  try {
    const existing = await setup.listIndexes();
    for (const i of indexes) if (!existing.includes(i.indexName)) await setup.createIndex({ indexName: i.indexName, dimension: i.dimension, metric: 'cosine' });
  } finally {
    await setup.close();
  }
  const sql = createClient({ url });
  try {
    const ann = await sql.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%_vector_idx'");
    for (const row of ann.rows) await sql.execute(`DROP INDEX IF EXISTS "${String(row.name).replace(/"/g, '')}"`);
  } finally {
    sql.close();
  }
  return new LibSQLVector({ id: 'mlp-vectors', url });
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** Matches simple filters: `{ key: value }` or `{ key: { $eq: value } }` (what Mastra memory sends). */
const matches = (metadata: Record<string, unknown>, filter: unknown) =>
  Object.entries((filter ?? {}) as Record<string, unknown>).every(([k, v]) =>
    v && typeof v === 'object' && '$eq' in v ? metadata[k] === (v as { $eq: unknown }).$eq : metadata[k] === v,
  );

/**
 * A stub vector service for tests: in-memory, cosine scoring, simple equality filters. It implements
 * MastraVector, so Memory and RAG code use it exactly like a real store.
 */
export class InMemoryVector extends MastraVector {
  readonly indexes = new Map<
    string,
    { dimension: number; rows: Map<string, { vector: number[]; metadata: Record<string, unknown> }> }
  >();

  constructor(id = 'in-memory-vector') {
    super({ id });
  }

  private index(name: string) {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`Index ${name} does not exist`);
    return idx;
  }

  async createIndex({ indexName, dimension }: CreateIndexParams): Promise<void> {
    if (!this.indexes.has(indexName)) this.indexes.set(indexName, { dimension, rows: new Map() });
  }

  async listIndexes(): Promise<string[]> {
    return [...this.indexes.keys()];
  }

  async describeIndex({ indexName }: DescribeIndexParams): Promise<IndexStats> {
    const idx = this.index(indexName);
    return { dimension: idx.dimension, count: idx.rows.size, metric: 'cosine' };
  }

  async deleteIndex({ indexName }: DeleteIndexParams): Promise<void> {
    this.indexes.delete(indexName);
  }

  async upsert({ indexName, vectors, metadata, ids }: UpsertVectorParams): Promise<string[]> {
    if (!this.indexes.has(indexName)) await this.createIndex({ indexName, dimension: vectors[0]?.length ?? 0 });
    const idx = this.index(indexName);
    return vectors.map((vector, i) => {
      const id = ids?.[i] ?? `vec-${idx.rows.size + 1}`;
      idx.rows.set(id, { vector, metadata: (metadata?.[i] ?? {}) as Record<string, unknown> });
      return id;
    });
  }

  async query({ indexName, queryVector, topK = 10, filter, includeVector }: QueryVectorParams): Promise<QueryResult[]> {
    const idx = this.indexes.get(indexName);
    if (!idx || !queryVector) return [];
    return [...idx.rows.entries()]
      .filter(([, r]) => matches(r.metadata, filter))
      .map(([id, r]) => ({
        id,
        score: cosine(queryVector, r.vector),
        metadata: r.metadata,
        ...(includeVector ? { vector: r.vector } : {}),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, topK);
  }

  async updateVector(params: UpdateVectorParams): Promise<void> {
    const idx = this.index(params.indexName);
    const row = 'id' in params && params.id ? idx.rows.get(params.id) : undefined;
    if (!row) return;
    if (params.update.vector) row.vector = params.update.vector;
    if (params.update.metadata) row.metadata = params.update.metadata;
  }

  async deleteVector({ indexName, id }: DeleteVectorParams): Promise<void> {
    this.indexes.get(indexName)?.rows.delete(id);
  }

  async deleteVectors(params: DeleteVectorsParams): Promise<void> {
    const idx = this.indexes.get(params.indexName);
    if (!idx) return;
    const p = params as { ids?: string[]; filter?: unknown };
    for (const [id, row] of [...idx.rows])
      if (p.ids?.includes(id) || (p.filter && matches(row.metadata, p.filter))) idx.rows.delete(id);
  }
}

export interface RecordedQuery {
  label: string;
  indexName: string;
  topK?: number;
  filter: unknown;
  hits: { id: string; score: number; metadata?: Record<string, unknown> }[];
}

/**
 * Wraps any MastraVector and records every upsert and query (filter, topK, hits), so a lab can show
 * exactly what semantic search did. `label` tags the queries of the current phase.
 */
export class RecordingVector extends MastraVector {
  label = 'default';
  readonly queries: RecordedQuery[] = [];
  upserts = 0;
  /** Ids this recorder wrote, per index (so a run can remove exactly its own vectors). */
  readonly written = new Map<string, string[]>();

  constructor(readonly inner: MastraVector) {
    super({ id: `recording-${inner.id}` });
  }

  override get isSelfEmbedding(): boolean {
    return this.inner.isSelfEmbedding;
  }

  async query(params: QueryVectorParams): Promise<QueryResult[]> {
    const hits = await this.inner.query(params);
    this.queries.push({
      label: this.label,
      indexName: params.indexName,
      topK: params.topK,
      filter: params.filter,
      hits: hits.map((h) => ({ id: h.id, score: Number(h.score.toFixed(4)), metadata: h.metadata })),
    });
    return hits;
  }

  async upsert(params: UpsertVectorParams): Promise<string[]> {
    this.upserts += params.vectors.length;
    const ids = await this.inner.upsert(params);
    this.written.set(params.indexName, [...(this.written.get(params.indexName) ?? []), ...ids]);
    return ids;
  }

  /** Deletes every vector this recorder wrote (keeps a shared store from growing run after run). */
  async deleteWritten(): Promise<number> {
    let n = 0;
    for (const [indexName, ids] of this.written) {
      if (ids.length) await this.inner.deleteVectors({ indexName, ids });
      n += ids.length;
    }
    this.written.clear();
    return n;
  }

  createIndex(p: CreateIndexParams) {
    return this.inner.createIndex(p);
  }
  listIndexes() {
    return this.inner.listIndexes();
  }
  describeIndex(p: DescribeIndexParams) {
    return this.inner.describeIndex(p);
  }
  deleteIndex(p: DeleteIndexParams) {
    return this.inner.deleteIndex(p);
  }
  updateVector(p: UpdateVectorParams) {
    return this.inner.updateVector(p);
  }
  deleteVector(p: DeleteVectorParams) {
    return this.inner.deleteVector(p);
  }
  deleteVectors(p: DeleteVectorsParams) {
    return this.inner.deleteVectors(p);
  }
}

const stem = (w: string) => w.replace(/(ies|ing|ed|es|s)$/, '');

/** FNV-1a 32-bit hash, for stable token buckets. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/**
 * A deterministic OFFLINE stand-in for an embedding model (not a real model): words in the same concept
 * group share a dimension, other words are hashed into the remaining dimensions, and the vector is
 * L2-normalised. Good enough to demonstrate "similar meaning ⇒ similar vector" without a network.
 */
export function createConceptEmbedder(opts: { groups: string[][]; dimensions?: number }): EmbeddingModelV2<string> {
  const dims = Math.max(opts.groups.length + 8, opts.dimensions ?? 64);
  const group = new Map<string, number>();
  opts.groups.forEach((g, i) => g.forEach((w) => group.set(stem(w.toLowerCase()), i)));
  const embed = (text: string) => {
    const v = new Array<number>(dims).fill(0);
    for (const raw of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      const w = stem(raw);
      if (w.length < 3) continue;
      const g = group.get(w);
      if (g !== undefined) v[g]! += 3;
      else v[opts.groups.length + (hash(w) % (dims - opts.groups.length))]! += 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  };
  return {
    specificationVersion: 'v2',
    provider: 'offline-sim',
    modelId: 'concept-embedder',
    maxEmbeddingsPerCall: 256,
    supportsParallelCalls: true,
    doEmbed: async ({ values }) => ({ embeddings: values.map(embed) }),
  };
}
