import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MDocument } from '@mastra/rag';
import type { MastraVector } from '@mastra/core/vector';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation } from '@mlp/lab-engine';
import { InMemoryVector, openExactVectorStore } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { courseLibrary, listLibrary } from '../lab-36/library.js';
import { analyseChunks } from '../lab-37/chunks.js';
import { CORPUS } from '../lab-37/corpus.js';
import { withVectorStore } from '../shared/vector-store-lock.js';
import { lab38Definition } from './definition.js';
import { cosine, EMBEDDERS, indexNameFor, resolveEmbedder } from './embedders.js';

export const STORE_FILE = 'lab-38-vectors';

export const Lab38InputSchema = z
  .object({
    source: z.enum(['sample', 'library']),
    chunkSize: z.number().int().min(100).max(1_000),
    overlap: z.number().int().min(0).max(200),
    embedder: z.enum(EMBEDDERS),
    dimensions: z.number().int().min(0).max(3_072),
    batchSize: z.number().int().min(1).max(256),
    store: z.enum(['libsql', 'in-memory']),
    idStrategy: z.enum(['content', 'random']),
  })
  .refine((v) => v.overlap < v.chunkSize, { message: 'overlap must be smaller than chunkSize', path: ['overlap'] })
  .refine((v) => v.dimensions === 0 || v.dimensions >= 64, {
    message: 'use 0 (model default) or at least 64',
    path: ['dimensions'],
  });
export type Lab38Input = z.infer<typeof Lab38InputSchema>;

export interface StoredRecord {
  id: string;
  docId: string;
  source: string;
  start: number;
  end: number;
  chunkIndex: number;
  preview: string;
}

export interface Lab38Output {
  embedder: { id: string; simulated: boolean; dimensions: number };
  store: Lab38Input['store'];
  indexName: string;
  documents: { docId: string; name: string }[];
  records: StoredRecord[];
  batches: { size: number; tokens: number }[];
  usage: { tokens: number; estimatedUsd: number };
  index: { dimension: number | null; countAfterFirst: number; countAfterSecond: number; addedByThisRun: number } | null;
  dimensionCheck: { ok: boolean; code: 'DIMENSION_MISMATCH' | null; message: string };
  selfQuery: { checked: number; topHit: number; metadataIntact: number; minScore: number };
  determinism: { samples: number; identical: number; minCosine: number };
  vectorPreview: { id: string; first: number[]; norm: number } | null;
}

const recordId = (strategy: Lab38Input['idStrategy'], docId: string, start: number, end: number, text: string) =>
  strategy === 'random'
    ? randomUUID()
    : createHash('sha256').update(`${docId}|${start}|${end}|${text}`).digest('hex').slice(0, 24);

export const lab38: LabImplementation<Lab38Input, Lab38Output, LabServices> = {
  definition: lab38Definition as LabDefinition,
  inputSchema: Lab38InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder(input.embedder, { mode: ctx.mode, openaiConfigured, dimensions: input.dimensions });
    if (embedder.simulated) ctx.log('info', 'Embedder: mock/concept-hash-64, a deterministic stand-in (not a real model).');

    // 1. Documents and chunks (offsets verified as in lab 37).
    const docs =
      input.source === 'library'
        ? listLibrary(courseLibrary(ctx.services), 5).map((d) => ({
            docId: d.docId,
            name: d.name,
            text: d.text,
            markdown: d.mime === 'text/markdown',
          }))
        : CORPUS.map((d) => ({ docId: d.docId, name: d.name, text: d.text, markdown: d.format === 'markdown' }));
    if (docs.length === 0)
      throw new LabError(
        'VALIDATION_FAILED',
        'The course library is empty: ingest documents in lab 36 first, or choose the built-in documents.',
      );
    const chunks: { record: StoredRecord; text: string }[] = [];
    for (const d of docs) {
      const doc = d.markdown
        ? MDocument.fromMarkdown(d.text, { source: d.name })
        : MDocument.fromText(d.text, { source: d.name });
      const raw = await doc.chunk({
        strategy: 'recursive',
        maxSize: input.chunkSize,
        overlap: input.overlap,
        addStartIndex: true,
      } as never);
      for (const c of analyseChunks(d, raw as never, 'l38').chunks) {
        if (c.start === null || c.end === null) continue;
        const text = d.text.slice(c.start, c.end);
        chunks.push({
          text,
          record: {
            id: recordId(input.idStrategy, d.docId, c.start, c.end, text),
            docId: d.docId,
            source: d.name,
            start: c.start,
            end: c.end,
            chunkIndex: c.index,
            preview: c.preview,
          },
        });
      }
    }
    ctx.log('info', `${chunks.length} chunk(s) from ${docs.length} document(s).`);

    // 2. Embeddings in batches.
    const batchSize = Math.min(input.batchSize, embedder.maxPerCall);
    const vectors: number[][] = [];
    const batches: Lab38Output['batches'] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      ctx.throwIfAborted();
      const slice = chunks.slice(i, i + batchSize);
      const started = Date.now();
      const r = await embedder.embed(
        slice.map((c) => c.text),
        ctx.signal,
      );
      vectors.push(...r.embeddings);
      batches.push({ size: slice.length, tokens: r.tokens });
      ctx.emit({
        type: 'workflow-step',
        stepId: `embed-batch-${batches.length}`,
        status: 'success',
        durationMs: Date.now() - started,
        output: { vectors: slice.length, tokens: r.tokens },
      });
    }
    const tokens = batches.reduce((n, b) => n + b.tokens, 0);

    // 3. Store, verify, query. libSQL access takes turns per file (see shared/vector-store-lock.ts).
    const indexName = indexNameFor(embedder);
    const work = async (store: MastraVector) => {
      const existing = (await store.listIndexes()).includes(indexName) ? await store.describeIndex({ indexName }) : null;
      if (existing && existing.dimension !== embedder.dimensions)
        return {
          mismatch: `Index ${indexName} holds ${existing.dimension}-dimensional vectors; this embedder produces ${embedder.dimensions}.`,
        } as const;
      if (!existing) await store.createIndex({ indexName, dimension: embedder.dimensions, metric: 'cosine' });
      const countBefore = existing?.count ?? 0;
      const upsert = () =>
        store.upsert({
          indexName,
          vectors,
          ids: chunks.map((c) => (input.idStrategy === 'random' ? randomUUID() : c.record.id)),
          metadata: chunks.map((c) => ({ ...c.record, text: c.text, embedder: embedder.id, dimensions: embedder.dimensions })),
        });
      await upsert();
      const afterFirst = (await store.describeIndex({ indexName })).count;
      ctx.emit({ type: 'workflow-step', stepId: 'upsert', status: 'success', output: { indexName, count: afterFirst } });
      await upsert(); // the same records again: content ids replace, random ids duplicate
      const afterSecond = (await store.describeIndex({ indexName })).count;
      ctx.emit({ type: 'workflow-step', stepId: 're-upsert', status: 'success', output: { count: afterSecond } });
      let topHit = 0;
      let intact = 0;
      let minScore = 1;
      for (let i = 0; i < chunks.length; i++) {
        const [hit] = await store.query({ indexName, queryVector: vectors[i]!, topK: 1 });
        const want = chunks[i]!.record;
        if (
          hit &&
          (input.idStrategy === 'random'
            ? hit.metadata?.docId === want.docId && hit.metadata?.start === want.start
            : hit.id === want.id)
        )
          topHit++;
        if (
          hit &&
          hit.metadata?.text === chunks[i]!.text &&
          hit.metadata?.source === want.source &&
          hit.metadata?.end === want.end
        )
          intact++;
        minScore = Math.min(minScore, hit?.score ?? 0);
      }
      ctx.emit({
        type: 'workflow-step',
        stepId: 'self-query',
        status: 'success',
        output: { checked: chunks.length, topHit, metadataIntact: intact },
      });
      return {
        dimension: (await store.describeIndex({ indexName })).dimension,
        countBefore,
        afterFirst,
        afterSecond,
        topHit,
        intact,
        minScore,
      } as const;
    };
    const result =
      input.store === 'libsql'
        ? await withVectorStore(
            ctx.services.memory.file(STORE_FILE),
            async () => {
              const store = await openExactVectorStore(ctx.services.memory.file(STORE_FILE), [{ indexName, dimension: embedder.dimensions }]);
              try {
                return await work(store);
              } finally {
                await (store as unknown as { close?: () => Promise<void> }).close?.();
              }
            },
            ctx.signal,
          )
        : await work(new InMemoryVector());

    // 4. Determinism: embed a few chunks again.
    const sample = chunks.slice(0, 3);
    const repeat = sample.length
      ? await embedder.embed(
          sample.map((c) => c.text),
          ctx.signal,
        )
      : { embeddings: [] as number[][], tokens: 0 };
    const again = repeat.embeddings;
    const cosines = again.map((v, i) => cosine(v, vectors[i]!));
    const identical = again.filter((v, i) => JSON.stringify(v) === JSON.stringify(vectors[i])).length;
    const allTokens = tokens + repeat.tokens; // includes the small determinism re-embedding

    const mismatch = 'mismatch' in result ? result.mismatch : null;
    if (mismatch) ctx.log('error', `DIMENSION_MISMATCH: ${mismatch}`);
    const idx = 'mismatch' in result ? null : result;
    const first = vectors[0];
    return {
      embedder: { id: embedder.id, simulated: embedder.simulated, dimensions: embedder.dimensions },
      store: input.store,
      indexName,
      documents: docs.map((d) => ({ docId: d.docId, name: d.name })),
      records: chunks.map((c) => c.record),
      batches,
      usage: { tokens: allTokens, estimatedUsd: Math.round((allTokens / 1_000_000) * embedder.usdPerMillionTokens * 1e6) / 1e6 },
      index: idx
        ? {
            dimension: idx.dimension,
            countAfterFirst: idx.afterFirst,
            countAfterSecond: idx.afterSecond,
            addedByThisRun: idx.afterSecond - idx.countBefore,
          }
        : null,
      dimensionCheck: mismatch
        ? { ok: false, code: 'DIMENSION_MISMATCH', message: mismatch }
        : { ok: true, code: null, message: `index ${indexName} has ${embedder.dimensions} dimensions` },
      selfQuery: {
        checked: idx ? chunks.length : 0,
        topHit: idx?.topHit ?? 0,
        metadataIntact: idx?.intact ?? 0,
        minScore: Number((idx?.minScore ?? 0).toFixed(4)),
      },
      determinism: { samples: sample.length, identical, minCosine: Number(Math.min(1, ...cosines).toFixed(6)) },
      vectorPreview: first
        ? {
            id: chunks[0]!.record.id,
            first: first.slice(0, 6).map((x) => Number(x.toFixed(4))),
            norm: Number(Math.sqrt(first.reduce((s, x) => s + x * x, 0)).toFixed(4)),
          }
        : null,
    };
  },

  validate(out) {
    const n = out.records.length;
    const checks: CheckResult[] = [
      {
        id: 'vectors-stored',
        label: 'Every chunk was embedded and stored with its source metadata',
        passed: n > 0 && out.index !== null && out.index.countAfterFirst >= n,
        message: out.index
          ? `${n} record(s) in ${out.indexName} (index count ${out.index.countAfterFirst})`
          : out.dimensionCheck.message,
      },
      {
        id: 'dimensions-consistent',
        label: 'The index holds vectors of exactly this embedder’s dimension',
        passed: out.dimensionCheck.ok && out.index?.dimension === out.embedder.dimensions,
        message: out.dimensionCheck.message,
      },
      {
        id: 'idempotent-upsert',
        label: 'Upserting the same records again did not change the index count',
        passed: out.index !== null && out.index.countAfterSecond === out.index.countAfterFirst,
        message: out.index
          ? `count ${out.index.countAfterFirst} → ${out.index.countAfterSecond} after the second upsert`
          : 'not stored',
      },
      {
        id: 'retrievable',
        label: 'Each record is the top hit for its own vector, with its metadata intact',
        passed: n > 0 && out.selfQuery.topHit === n && out.selfQuery.metadataIntact === n,
        message: `${out.selfQuery.topHit}/${n} top hits, ${out.selfQuery.metadataIntact}/${n} with intact metadata (min score ${out.selfQuery.minScore})`,
      },
      {
        id: 'deterministic-embeddings',
        label: out.embedder.simulated
          ? 'Re-embedding gives identical vectors (mock embedder)'
          : 'Re-embedding gives the same direction (cosine ≥ 0.9999; providers are not bitwise deterministic)',
        passed:
          out.determinism.samples > 0 &&
          (out.embedder.simulated ? out.determinism.identical === out.determinism.samples : out.determinism.minCosine >= 0.9999),
        message: `${out.determinism.identical}/${out.determinism.samples} identical; min cosine ${out.determinism.minCosine}`,
      },
    ];
    return summarizeChecks(checks);
  },
};
