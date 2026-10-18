import { z } from 'zod';
import type { MastraVector } from '@mastra/core/vector';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { InMemoryVector, openVectorStore } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { EMBEDDERS, indexNameFor, resolveEmbedder } from '../lab-38/embedders.js';
import { STORE_FILE } from '../lab-38/run.js';
import { withVectorStore } from '../shared/vector-store-lock.js';
import { lab39Definition } from './definition.js';
import { buildCorpusIndex, keywordsOf, meetsExpectation, snippetFor, type Expectation } from './retrieve.js';

const ExpectationSchema = z.union([
  z.literal('none'),
  z.object({ docId: z.string().min(1).max(64), contains: z.string().min(1).max(120) }),
]);

export const Lab39InputSchema = z.object({
  questions: z
    .array(z.object({ question: z.string().trim().min(3).max(300), expect: ExpectationSchema.optional() }))
    .min(1)
    .max(6),
  indexSource: z.enum(['build', 'lab-38', 'empty']),
  chunking: z.enum(['sections', 'recursive-200']).default('sections'),
  embedder: z.enum(EMBEDDERS),
  dimensions: z.number().int().min(0).max(3_072),
  topK: z.number().int().min(1).max(10),
  minScore: z.number().min(-1).max(1),
});
export type Lab39Input = z.infer<typeof Lab39InputSchema>;

export interface Hit {
  rank: number;
  id: string;
  docId: string;
  source: string;
  score: number;
  chunkStart: number;
  chunkEnd: number;
  snippet: string;
  snippetStart: number;
  snippetEnd: number;
  matchedKeywords: string[];
  /** Verified: the snippet equals the source (or stored chunk) text at its offsets. */
  traceable: boolean;
}

export interface QuestionResult {
  question: string;
  status: 'answered' | 'no-relevant-results' | 'empty-index';
  hits: Hit[];
  belowThreshold: number;
  expectation: Expectation | null;
  expectationMet: boolean | null;
}

export interface Lab39Output {
  indexSource: Lab39Input['indexSource'];
  chunking: Lab39Input['chunking'] | null;
  embedder: { id: string; simulated: boolean; dimensions: number };
  index: { name: string; records: number };
  topK: number;
  minScore: number;
  results: QuestionResult[];
  usage: { tokens: number };
}

export const lab39: LabImplementation<Lab39Input, Lab39Output, LabServices> = {
  definition: lab39Definition as LabDefinition,
  inputSchema: Lab39InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder(input.embedder, { mode: ctx.mode, openaiConfigured, dimensions: input.dimensions });
    if (embedder.simulated) ctx.log('info', 'Embedder: mock/concept-hash-64, a deterministic stand-in (not a real model).');
    let tokens = 0;

    const search = async (store: MastraVector, indexName: string, sourceText: (docId: string) => string | undefined) => {
      const exists = (await store.listIndexes()).includes(indexName);
      const records = exists ? (await store.describeIndex({ indexName })).count : 0;
      ctx.emit({ type: 'workflow-step', stepId: 'open-index', status: 'success', output: { indexName, records } });
      const results: QuestionResult[] = [];
      for (const q of input.questions) {
        ctx.throwIfAborted();
        if (records === 0) {
          results.push({
            question: q.question,
            status: 'empty-index',
            hits: [],
            belowThreshold: 0,
            expectation: q.expect ?? null,
            expectationMet: null,
          });
          continue;
        }
        const e = await embedder.embed([q.question], ctx.signal);
        tokens += e.tokens;
        const raw = await store.query({ indexName, queryVector: e.embeddings[0]!, topK: input.topK });
        const kept = raw.filter((h) => h.score >= input.minScore);
        const keywords = keywordsOf(q.question);
        const hits: Hit[] = kept.map((h, i) => {
          const m = (h.metadata ?? {}) as { docId?: string; source?: string; start?: number; end?: number; text?: string };
          const chunkText = m.text ?? '';
          const chunkStart = m.start ?? 0;
          const s = snippetFor(chunkText, chunkStart, keywords);
          const full = m.docId ? sourceText(m.docId) : undefined;
          const traceable =
            full !== undefined
              ? full.slice(s.start, s.end) === s.snippet
              : chunkText.slice(s.start - chunkStart, s.end - chunkStart) === s.snippet &&
                (m.end ?? 0) - chunkStart === chunkText.length;
          return {
            rank: i + 1,
            id: h.id,
            docId: m.docId ?? '?',
            source: m.source ?? '?',
            score: Number(h.score.toFixed(4)),
            chunkStart,
            chunkEnd: m.end ?? chunkStart + chunkText.length,
            snippet: s.snippet,
            snippetStart: s.start,
            snippetEnd: s.end,
            matchedKeywords: s.matched,
            traceable,
          };
        });
        const texts = kept.map((h) => ({ docId: String(h.metadata?.docId ?? ''), text: String(h.metadata?.text ?? '') }));
        const result: QuestionResult = {
          question: q.question,
          status: hits.length ? 'answered' : 'no-relevant-results',
          hits,
          belowThreshold: raw.length - kept.length,
          expectation: q.expect ?? null,
          expectationMet: meetsExpectation(q.expect, texts),
        };
        results.push(result);
        ctx.emit({
          type: 'workflow-step',
          stepId: `search: ${q.question.slice(0, 40)}`,
          status: 'success',
          output: { hits: hits.map((h) => `${h.score} ${h.source}@${h.chunkStart}`), belowThreshold: result.belowThreshold },
        });
        ctx.log(
          result.expectationMet === false ? 'warn' : 'info',
          `"${q.question}": ${hits.length ? `top ${hits[0]!.score} ${hits[0]!.source} — “${hits[0]!.snippet.slice(0, 70)}…”` : result.status}${result.expectationMet === false ? ' (not the expected chunk)' : ''}`,
        );
      }
      return { results, records };
    };

    let out: { results: QuestionResult[]; records: number };
    let indexName: string;
    if (input.indexSource === 'build') {
      const built = await buildCorpusIndex(embedder, input.chunking, ctx.signal);
      tokens += built.tokens;
      indexName = built.indexName;
      ctx.log('info', `Indexed ${built.chunks.length} corpus chunk(s) with ${input.chunking} chunking.`);
      out = await search(built.store, indexName, (id) => built.sources.get(id));
    } else if (input.indexSource === 'empty') {
      indexName = 'empty';
      const store = new InMemoryVector();
      await store.createIndex({ indexName, dimension: embedder.dimensions, metric: 'cosine' });
      out = await search(store, indexName, () => undefined);
    } else {
      indexName = indexNameFor(embedder);
      const file = ctx.services.memory.file(STORE_FILE);
      out = await withVectorStore(
        file,
        async () => {
          const store = openVectorStore(file);
          try {
            return await search(store, indexName, () => undefined);
          } finally {
            await (store as unknown as { close?: () => Promise<void> }).close?.();
          }
        },
        ctx.signal,
      );
      if (out.records === 0)
        ctx.log('warn', `The lab 38 index ${indexName} is empty or missing: run lab 38 with the same embedder first.`);
    }
    return {
      indexSource: input.indexSource,
      chunking: input.indexSource === 'build' ? input.chunking : null,
      embedder: { id: embedder.id, simulated: embedder.simulated, dimensions: embedder.dimensions },
      index: { name: indexName, records: out.records },
      topK: input.topK,
      minScore: input.minScore,
      results: out.results,
      usage: { tokens },
    };
  },

  validate(out) {
    const empty = out.index.records === 0;
    const allHits = out.results.flatMap((r) => r.hits);
    const checks: CheckResult[] = [];
    if (!empty) {
      const judged = out.results.filter((r) => r.expectationMet !== null);
      const missed = judged.filter((r) => !r.expectationMet);
      checks.push({
        id: 'expected-order',
        label: 'Known questions returned their expected chunk first (and unrelated ones returned nothing)',
        passed: missed.length === 0,
        message: missed.length
          ? missed
              .map(
                (r) => `"${r.question}": got ${r.hits[0] ? `${r.hits[0].docId} “${r.hits[0].snippet.slice(0, 40)}…”` : 'no hit'}`,
              )
              .join('; ')
          : `${judged.length} expectation(s) met`,
      });
    }
    const unsorted = out.results.filter(
      (r) =>
        r.hits.some((h, i) => i > 0 && h.score > r.hits[i - 1]!.score) ||
        r.hits.length > out.topK ||
        r.hits.some((h) => h.score < out.minScore),
    );
    checks.push({
      id: 'scores-ranked',
      label: 'Hits are ranked by similarity, at most topK, all at or above minScore',
      passed: unsorted.length === 0,
      message: unsorted.length
        ? `not ranked for ${unsorted.length} question(s)`
        : `${allHits.length} hit(s) across ${out.results.length} question(s)`,
    });
    const untraceable = allHits.filter((h) => !h.traceable);
    checks.push({
      id: 'snippets-traceable',
      label: 'Every snippet shows its source and offsets, and matches the source text there',
      passed: untraceable.length === 0,
      message: untraceable.length
        ? `${untraceable.length} snippet(s) do not match their offsets`
        : `${allHits.length} snippet(s) verified`,
    });
    checks.push({
      id: 'empty-index-handled',
      label: 'An empty index gives an explicit “empty index” result, not an error',
      passed: empty ? out.results.every((r) => r.status === 'empty-index' && r.hits.length === 0) : true,
      message: empty
        ? `index ${out.index.name} is empty: ${out.results.length} question(s) reported empty-index`
        : `index ${out.index.name} has ${out.index.records} record(s)`,
    });
    return summarizeChecks(checks);
  },
};
