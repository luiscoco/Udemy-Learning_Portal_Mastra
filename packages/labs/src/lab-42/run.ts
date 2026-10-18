import { z } from 'zod';
import { summarizeChecks, type CheckResult, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { InMemoryVector } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { resolveEmbedder } from '../lab-38/embedders.js';
import { lab42Definition } from './definition.js';
import { bm25Scores, fuse, rank, recompute, type FusedHit, type FusionMethod } from './hybrid.js';
import { PASSAGES } from './passages.js';

const METHODS: FusionMethod[] = ['keyword-only', 'vector-only', 'rrf', 'weighted'];

export const Lab42InputSchema = z.object({
  questions: z
    .array(
      z.object({ question: z.string().trim().min(3).max(300), expect: z.object({ id: z.string().min(1).max(64) }).optional() }),
    )
    .min(1)
    .max(6),
  method: z.enum(['rrf', 'weighted', 'keyword-only', 'vector-only']),
  // Hidden (not submitted) by the form unless their method is selected: defaults match the definition.
  rrfK: z.number().int().min(1).max(200).default(60),
  alpha: z.number().min(0).max(1).default(0.5),
  vectorFloor: z.number().min(-1).max(1),
  topK: z.number().int().min(1).max(9),
});
export type Lab42Input = z.infer<typeof Lab42InputSchema>;

export interface ExplainedHit extends FusedHit {
  rank: number;
  source: string;
  snippet: string;
}

export interface QuestionResult {
  question: string;
  expect: string | null;
  hits: ExplainedHit[];
  /** Top-1 passage per method (for the comparison table). */
  topByMethod: Record<FusionMethod, string | null>;
  deterministic: boolean;
}

export interface Lab42Output {
  method: Lab42Input['method'];
  params: { rrfK: number; alpha: number; vectorFloor: number; bm25: { k1: number; b: number } };
  embedder: { id: string; simulated: boolean };
  results: QuestionResult[];
  accuracy: Record<FusionMethod, { correct: number; judged: number }>;
}

export const lab42: LabImplementation<Lab42Input, Lab42Output, LabServices> = {
  definition: lab42Definition as LabDefinition,
  inputSchema: Lab42InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder('default', { mode: ctx.mode, openaiConfigured, dimensions: 0 });
    if (embedder.simulated) ctx.log('info', 'Vector side: mock/concept-hash-64, a deterministic stand-in (not a real model).');
    const store = new InMemoryVector(); // exact cosine search
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
    const byId = new Map(PASSAGES.map((p) => [p.id, p]));
    const opts = { k: input.rrfK, alpha: input.alpha };

    const results: QuestionResult[] = [];
    for (const q of input.questions) {
      ctx.throwIfAborted();
      const kwRaw = bm25Scores(PASSAGES, q.question);
      const kwRanked = rank(new Map([...kwRaw].map(([id, v]) => [id, v.score])));
      const keyword = new Map([...kwRanked].map(([id, r]) => [id, { ...r, matched: kwRaw.get(id)?.matched ?? [] }]));
      const [qv] = (await embedder.embed([q.question], ctx.signal)).embeddings;
      const vhits = await store.query({ indexName: 'passages', queryVector: qv!, topK: PASSAGES.length });
      // Ranked only at or above the floor (rank() ranks scores strictly above its floor argument).
      const vector = rank(new Map(vhits.map((h) => [h.id, h.score])), input.vectorFloor - 1e-9);

      const fused = fuse(keyword, vector, input.method, opts);
      const again = fuse(keyword, vector, input.method, opts);
      const topByMethod = Object.fromEntries(METHODS.map((m) => [m, fuse(keyword, vector, m, opts)[0]?.id ?? null])) as Record<
        FusionMethod,
        string | null
      >;
      const hits: ExplainedHit[] = fused.slice(0, input.topK).map((h, i) => {
        const p = byId.get(h.id)!;
        return { ...h, rank: i + 1, source: p.source, snippet: p.text.slice(0, 140) };
      });
      results.push({
        question: q.question,
        expect: q.expect?.id ?? null,
        hits,
        topByMethod,
        deterministic: JSON.stringify(fused) === JSON.stringify(again),
      });
      ctx.emit({
        type: 'workflow-step',
        stepId: `search: ${q.question.slice(0, 40)}`,
        status: 'success',
        output: { top: hits[0]?.id ?? null, explanation: hits[0]?.explanation ?? 'no hits', byMethod: topByMethod },
      });
      ctx.log(
        q.expect && hits[0]?.id !== q.expect.id ? 'warn' : 'info',
        `"${q.question}": ${hits[0] ? `${hits[0].id} — ${hits[0].explanation}` : 'no hits'} | keyword ${topByMethod['keyword-only'] ?? '—'}, vector ${topByMethod['vector-only'] ?? '—'}`,
      );
    }
    const accuracy = Object.fromEntries(
      METHODS.map((m) => {
        const judged = results.filter((r) => r.expect !== null);
        return [m, { correct: judged.filter((r) => r.topByMethod[m] === r.expect).length, judged: judged.length }];
      }),
    ) as Lab42Output['accuracy'];
    ctx.setResultExtras({
      effective: { mode: ctx.mode, simulated: embedder.simulated, embedder: embedder.id, method: input.method },
    });
    return {
      method: input.method,
      params: { rrfK: input.rrfK, alpha: input.alpha, vectorFloor: input.vectorFloor, bm25: { k1: 1.2, b: 0.75 } },
      embedder: { id: embedder.id, simulated: embedder.simulated },
      results,
      accuracy,
    };
  },

  validate(out, _input, { mode }) {
    const judged = out.results.filter((r) => r.expect !== null);
    const missed = judged.filter((r) => r.hits[0]?.id !== r.expect);
    const sel = out.accuracy[out.method];
    const best = Math.max(out.accuracy['keyword-only'].correct, out.accuracy['vector-only'].correct);
    const opts = { k: out.params.rrfK, alpha: out.params.alpha };
    const unexplained = out.results
      .flatMap((r) => r.hits)
      .filter((h) => recompute(h, out.method, opts) !== h.fused || !h.explanation.includes(String(h.fused)));
    const checks: CheckResult[] = [
      {
        id: 'hybrid-expected-top',
        label: 'The selected method ranked each question’s expected passage first',
        passed: missed.length === 0,
        message: missed.length
          ? missed.map((r) => `"${r.question}": got ${r.hits[0]?.id ?? 'nothing'}, expected ${r.expect}`).join('; ')
          : `${judged.length}/${judged.length} correct`,
      },
      {
        id: 'hybrid-beats-single',
        label: 'The selected method is at least as accurate as keyword-only and vector-only',
        passed: sel.correct >= best,
        message: Object.entries(out.accuracy)
          .map(([m, a]) => `${m} ${a.correct}/${a.judged}`)
          .join(', '),
      },
      {
        id: 'scoring-explained',
        label: 'Every hit’s fused score recomputes exactly from the components it shows',
        passed: unexplained.length === 0,
        message: unexplained.length
          ? `${unexplained.length} hit(s) do not match their explanation`
          : `${out.results.flatMap((r) => r.hits).length} hit(s) explained`,
      },
      {
        id: 'deterministic',
        label: 'Fusing the same rankings twice gives the same order and scores',
        passed: out.results.every((r) => r.deterministic),
        message: out.results.every((r) => r.deterministic) ? 'identical on every question' : 'fusion is not deterministic',
      },
    ];
    if (mode === 'offline' && (out.method === 'rrf' || out.method === 'weighted')) {
      const kwFixed = judged.filter((r) => r.topByMethod['keyword-only'] !== r.expect && r.topByMethod[out.method] === r.expect);
      const vecFixed = judged.filter((r) => r.topByMethod['vector-only'] !== r.expect && r.topByMethod[out.method] === r.expect);
      checks.push({
        id: 'complementary',
        label: 'Hybrid fixed at least one keyword-only miss and one vector-only miss',
        passed: kwFixed.length > 0 && vecFixed.length > 0,
        message: `keyword misses fixed: ${kwFixed.map((r) => `"${r.question}"`).join(', ') || 'none'}; vector misses fixed: ${vecFixed.map((r) => `"${r.question}"`).join(', ') || 'none'}`,
      });
    }
    return summarizeChecks(checks);
  },
};
