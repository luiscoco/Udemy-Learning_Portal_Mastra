import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { MastraAgentRelevanceScorer, rerankWithScorer } from '@mastra/rag';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, InMemoryVector } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { resolveEmbedder } from '../lab-38/embedders.js';
import { PASSAGES } from '../lab-42/passages.js';
import { lab43Definition } from './definition.js';
import {
  keywordScorer,
  SafeScorer,
  scorerScript,
  validateWeights,
  type RelevanceScoreProvider,
  type ScorerCall,
} from './scorers.js';

export const Lab43InputSchema = z
  .object({
    questions: z
      .array(
        z.object({ question: z.string().trim().min(3).max(300), expect: z.object({ id: z.string().min(1).max(64) }).optional() }),
      )
      .min(1)
      .max(6),
    scorer: z.enum(['agent', 'keyword', 'none']),
    candidates: z.number().int().min(2).max(9),
    weightSemantic: z.number().min(0).max(1),
    weightVector: z.number().min(0).max(1),
    weightPosition: z.number().min(0).max(1),
    chattyScorer: z.boolean().default(false),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  .refine((v) => validateWeights({ semantic: v.weightSemantic, vector: v.weightVector, position: v.weightPosition }) === null, {
    message: 'weights must add up to 1',
    path: ['weightPosition'],
  });
export type Lab43Input = z.infer<typeof Lab43InputSchema>;

export interface Row {
  id: string;
  docId: string;
  source: string;
  firstStageRank: number;
  firstStageScore: number;
  rerankedRank: number;
  movement: number;
  components: { semantic: number; vector: number; position: number } | null;
  final: number;
  provenanceIntact: boolean;
}

export interface QuestionResult {
  question: string;
  expect: string | null;
  before: string[];
  after: string[];
  rows: Row[];
  stable: boolean;
  scorerCalls: ScorerCall[];
}

export interface Lab43Output {
  scorer: Lab43Input['scorer'];
  scorerLabel: string;
  weights: { semantic: number; vector: number; position: number };
  embedder: string;
  results: QuestionResult[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export const lab43: LabImplementation<Lab43Input, Lab43Output, LabServices> = {
  definition: lab43Definition as LabDefinition,
  inputSchema: Lab43InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder('default', { mode: ctx.mode, openaiConfigured, dimensions: 0 });
    const store = new InMemoryVector();
    await store.createIndex({ indexName: 'passages', dimension: embedder.dimensions, metric: 'cosine' });
    const { embeddings } = await embedder.embed(
      PASSAGES.map((p) => p.text),
      ctx.signal,
    );
    await store.upsert({
      indexName: 'passages',
      vectors: embeddings,
      ids: PASSAGES.map((p) => p.id),
      metadata: PASSAGES.map((p) => ({ ...p })),
    });

    const weights = { semantic: input.weightSemantic, vector: input.weightVector, position: input.weightPosition };
    let inner: RelevanceScoreProvider | null = null;
    let scorerLabel = 'none (first stage only)';
    if (input.scorer === 'keyword') {
      inner = keywordScorer;
      scorerLabel = 'keyword overlap (local, deterministic)';
    } else if (input.scorer === 'agent') {
      const resolved = ctx.services.models.resolve({
        mode: ctx.mode,
        modelId: input.modelId,
        offline: scorerScript(input.chattyScorer),
      });
      inner = new MastraAgentRelevanceScorer('lab43', resolved.model as never);
      scorerLabel = `MastraAgentRelevanceScorer (${resolved.simulated ? 'scripted offline model' : input.modelId})`;
      ctx.setResultExtras({
        effective: { mode: ctx.mode, simulated: resolved.simulated, modelId: input.modelId, embedder: embedder.id },
      });
    }
    if (input.scorer !== 'agent')
      ctx.setResultExtras({ effective: { mode: ctx.mode, simulated: embedder.simulated, embedder: embedder.id } });
    if (input.chattyScorer && input.scorer === 'agent' && ctx.mode === 'offline')
      ctx.log('warn', 'Chatty scorer: Mastra rejects replies like "Relevance: 0.9"; the safe wrapper flags them and uses 0.');

    const results: QuestionResult[] = [];
    for (const q of input.questions) {
      ctx.throwIfAborted();
      const [qv] = (await embedder.embed([q.question], ctx.signal)).embeddings;
      const candidates = await store.query({ indexName: 'passages', queryVector: qv!, topK: input.candidates });
      const before = candidates.map((c) => c.id);
      let rows: Row[];
      let after = before;
      let stable = true;
      let calls: ScorerCall[] = [];
      if (!inner) {
        rows = candidates.map((c, i) => ({
          id: c.id,
          docId: String(c.metadata?.docId),
          source: String(c.metadata?.source),
          firstStageRank: i + 1,
          firstStageScore: r4(c.score),
          rerankedRank: i + 1,
          movement: 0,
          components: null,
          final: r4(c.score),
          provenanceIntact: true,
        }));
      } else {
        const safe = new SafeScorer(inner);
        const reranked = await rerankWithScorer({
          results: candidates,
          query: q.question,
          scorer: safe,
          options: { weights, topK: candidates.length },
        });
        const again = await rerankWithScorer({
          results: candidates,
          query: q.question,
          scorer: new SafeScorer(inner),
          options: { weights, topK: candidates.length },
        });
        calls = safe.calls;
        after = reranked.map((r) => r.result.id);
        const deterministic = input.scorer === 'keyword' || ctx.mode === 'offline';
        stable = deterministic
          ? JSON.stringify(reranked.map((r) => [r.result.id, r.score])) ===
            JSON.stringify(again.map((r) => [r.result.id, r.score]))
          : reranked[0]?.result.id === again[0]?.result.id;
        rows = reranked.map((r, i) => {
          const firstStageRank = before.indexOf(r.result.id) + 1;
          const original = candidates.find((c) => c.id === r.result.id);
          return {
            id: r.result.id,
            docId: String(r.result.metadata?.docId),
            source: String(r.result.metadata?.source),
            firstStageRank,
            firstStageScore: r4(original?.score ?? NaN),
            rerankedRank: i + 1,
            movement: firstStageRank - (i + 1),
            components: { semantic: r4(r.details.semantic), vector: r4(r.details.vector), position: r4(r.details.position) },
            final: r4(r.score),
            provenanceIntact: !!original && isDeepStrictEqual(original.metadata, r.result.metadata),
          };
        });
      }
      results.push({ question: q.question, expect: q.expect?.id ?? null, before, after, rows, stable, scorerCalls: calls });
      ctx.emit({
        type: 'workflow-step',
        stepId: `rerank: ${q.question.slice(0, 40)}`,
        status: 'success',
        output: { before: before.slice(0, 3), after: after.slice(0, 3), flagged: calls.filter((c) => c.flag).length },
      });
      ctx.log(
        q.expect && after[0] !== q.expect.id ? 'warn' : 'info',
        `"${q.question}": before ${before.slice(0, 3).join(' > ')} | after ${after.slice(0, 3).join(' > ')}${calls.some((c) => c.flag) ? ` | ${calls.filter((c) => c.flag).length} scorer reply(ies) flagged` : ''}`,
      );
    }
    return { scorer: input.scorer, scorerLabel, weights, embedder: embedder.id, results };
  },

  validate(out) {
    const judged = out.results.filter((r) => r.expect !== null);
    const missed = judged.filter((r) => r.after[0] !== r.expect);
    const rows = out.results.flatMap((r) => r.rows);
    const flagged = out.results.flatMap((r) => r.scorerCalls.filter((c) => c.flag));
    const nanFinals = rows.filter((r) => !Number.isFinite(r.final));
    const checks: CheckResult[] = [
      {
        id: 'expected-top-after-rerank',
        label: 'After reranking, each question’s expected passage is first',
        passed: missed.length === 0,
        message: missed.length
          ? missed.map((r) => `"${r.question}": ${r.after[0]} (expected ${r.expect})`).join('; ')
          : `${judged.length}/${judged.length} correct; moved up: ${
              out.results
                .filter((r) => r.before[0] !== r.after[0])
                .map((r) => `${r.after[0]} (was #${r.before.indexOf(r.after[0]!) + 1})`)
                .join(', ') || 'none'
            }`,
      },
      {
        id: 'ranks-stable',
        label: 'Reranking the same candidates again gives the same order',
        passed: out.results.every((r) => r.stable),
        message: out.results.every((r) => r.stable)
          ? `stable for ${out.results.length} question(s)`
          : 'order changed between two reranks',
      },
      {
        id: 'provenance-retained',
        label: 'Every reranked result is an original candidate with unchanged id, document, source and text',
        passed: rows.length > 0 && rows.every((r) => r.provenanceIntact && r.firstStageRank > 0),
        message: `${rows.filter((r) => r.provenanceIntact).length}/${rows.length} row(s) intact`,
      },
      {
        id: 'before-after-shown',
        label: 'Every candidate shows its rank before and after, and its score components',
        passed: rows.every((r) => r.firstStageRank > 0 && r.rerankedRank > 0 && (out.scorer === 'none' || r.components !== null)),
        message: `${rows.length} row(s) with before/after ranks`,
      },
      {
        id: 'scorer-output-validated',
        label: 'No invalid scorer reply reached the ranking (errors, NaN or out-of-range values are replaced and flagged)',
        passed: nanFinals.length === 0,
        message: nanFinals.length
          ? `${nanFinals.length} final score(s) are not numbers`
          : flagged.length
            ? `${flagged.length} reply(ies) flagged (${[...new Set(flagged.map((f) => f.flag))].join(', ')}) and replaced by 0`
            : 'all scorer replies were valid numbers in 0–1',
      },
    ];
    return summarizeChecks(checks);
  },
};
