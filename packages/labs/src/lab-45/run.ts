import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, InMemoryVector } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { resolveEmbedder, type Embedder } from '../lab-38/embedders.js';
import { bm25Scores, fuse, rank } from '../lab-42/hybrid.js';
import { PASSAGES } from '../lab-42/passages.js';
import { guardClaims, type SourcePassage } from '../lab-44/claims.js';
import { INSTRUCTIONS, offlineScript, promptFor } from '../lab-44/run.js';
import { lab45Definition } from './definition.js';
import {
  aggregate,
  METRIC_IDS,
  scoreItem,
  summaryLine,
  type Aggregate,
  type EvalOutput,
  type ItemScore,
  type MetricId,
} from './metrics.js';

const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  question: z.string().trim().min(3).max(300),
  relevant: z.array(z.string().min(1).max(64)).max(6),
  answerable: z.boolean(),
});

export const Lab45InputSchema = z
  .object({
    dataset: z
      .array(ItemSchema)
      .min(1)
      .max(12)
      .refine((d) => new Set(d.map((x) => x.id)).size === d.length, { message: 'item ids must be unique' }),
    retrieval: z.enum(['hybrid', 'vector-only', 'keyword-only']),
    maxSources: z.number().int().min(1).max(6),
    offlineBehaviour: z.enum(['faithful', 'sloppy']).default('faithful'),
    gates: z.object({
      'retrieval-hit-rate': z.number().min(0).max(1),
      'context-relevance': z.number().min(0).max(1),
      'answer-faithfulness': z.number().min(0).max(1),
      abstention: z.number().min(0).max(1),
      'answer-rate': z.number().min(0).max(1),
    }),
    modelId: z.enum(DEFAULT_LIVE_MODELS),
  })
  .refine((v) => v.dataset.every((d) => d.answerable === d.relevant.length > 0), {
    message: 'answerable items need relevant passages, unanswerable ones none',
    path: ['dataset'],
  });
export type Lab45Input = z.infer<typeof Lab45InputSchema>;

export interface ItemResult {
  id: string;
  question: string;
  groundTruth: { relevant: string[]; answerable: boolean };
  retrieved: string[];
  claims: { text: string; accepted: boolean; reasons: string[] }[];
  shownClaims: number;
  scores: Record<MetricId, ItemScore>;
}

export interface Lab45Output {
  config: { retrieval: Lab45Input['retrieval']; maxSources: number; generator: string; embedder: string; simulated: boolean };
  items: ItemResult[];
  aggregates: Record<MetricId, Aggregate>;
  gates: Record<MetricId, { min: number; mean: number | null; pass: boolean | null }>;
  summary: string[];
  reproducibility: { rescoreIdentical: boolean; rerunIdentical: boolean | null; note: string };
}

async function runSuite(ctx: RunContext<LabServices>, input: Lab45Input, embedder: Embedder, agent: Agent) {
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
  const method = input.retrieval === 'hybrid' ? 'rrf' : input.retrieval;
  const items: ItemResult[] = [];
  for (const item of input.dataset) {
    ctx.throwIfAborted();
    const kwRaw = bm25Scores(PASSAGES, item.question);
    const keyword = new Map(
      [...rank(new Map([...kwRaw].map(([id, v]) => [id, v.score])))].map(([id, r]) => [
        id,
        { ...r, matched: kwRaw.get(id)?.matched ?? [] },
      ]),
    );
    const [qv] = (await embedder.embed([item.question], ctx.signal)).embeddings;
    const vector = rank(
      new Map(
        (await store.query({ indexName: 'passages', queryVector: qv!, topK: PASSAGES.length })).map((h) => [h.id, h.score]),
      ),
      0.25 - 1e-9,
    );
    const fused = fuse(keyword, vector, method, { k: 60, alpha: 0.5 }).slice(0, input.maxSources);
    const sources: SourcePassage[] = fused.map((f) => {
      const p = PASSAGES.find((x) => x.id === f.id)!;
      return { id: p.id, title: p.source.split('#')[0]!, location: p.source, text: p.text };
    });
    const reply = sources.length
      ? (await agent.generate(promptFor(item.question, sources), { abortSignal: ctx.signal })).text
      : '{"claims": []}';
    const g = guardClaims(reply, sources, { enforce: true });
    const output: EvalOutput = {
      retrieved: sources.map((s) => s.id),
      verdicts: g.verdicts.map((v) => ({ text: v.text, accepted: v.accepted })),
      shownClaims: g.citedAnswer.claims.length,
    };
    const scores = await scoreItem({ itemId: item.id, question: item.question }, output, {
      relevant: item.relevant,
      answerable: item.answerable,
    });
    items.push({
      id: item.id,
      question: item.question,
      groundTruth: { relevant: item.relevant, answerable: item.answerable },
      retrieved: output.retrieved,
      claims: g.verdicts.map((v) => ({ text: v.text, accepted: v.accepted, reasons: v.reasons.map((r) => r.code) })),
      shownClaims: output.shownClaims,
      scores,
    });
  }
  return items;
}

const aggregatesOf = (items: ItemResult[]) =>
  Object.fromEntries(METRIC_IDS.map((m) => [m, aggregate(items.map((i) => i.scores[m]))])) as Record<MetricId, Aggregate>;

export const lab45: LabImplementation<Lab45Input, Lab45Output, LabServices> = {
  definition: lab45Definition as LabDefinition,
  inputSchema: Lab45InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder('default', { mode: ctx.mode, openaiConfigured, dimensions: 0 });
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.offlineBehaviour),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'cited-answerer', name: 'Cited Answerer', instructions: INSTRUCTIONS, model: resolved.model }),
    );

    const items = await runSuite(ctx, input, embedder, agent);
    for (const it of items)
      ctx.emit({
        type: 'workflow-step',
        stepId: `eval: ${it.id}`,
        status: 'success',
        output: Object.fromEntries(
          METRIC_IDS.map((m) => [m, 'score' in it.scores[m] ? (it.scores[m] as { score: number }).score : 'n/a']),
        ),
      });
    const aggregates = aggregatesOf(items);

    // Reproducibility 1: re-score the stored outputs with fresh scorer instances.
    const rescored = await Promise.all(
      items.map((it) =>
        scoreItem(
          { itemId: it.id, question: it.question },
          {
            retrieved: it.retrieved,
            verdicts: it.claims.map((c) => ({ text: c.text, accepted: c.accepted })),
            shownClaims: it.shownClaims,
          },
          it.groundTruth,
        ),
      ),
    );
    const rescoreIdentical = JSON.stringify(rescored) === JSON.stringify(items.map((i) => i.scores));
    // Reproducibility 2 (offline only): run the whole suite again.
    let rerunIdentical: boolean | null = null;
    if (resolved.simulated && embedder.simulated)
      rerunIdentical = JSON.stringify(aggregatesOf(await runSuite(ctx, input, embedder, agent))) === JSON.stringify(aggregates);

    const gates = Object.fromEntries(
      METRIC_IDS.map((m) => [
        m,
        {
          min: input.gates[m],
          mean: aggregates[m].mean,
          pass: aggregates[m].mean === null ? null : aggregates[m].mean! >= input.gates[m],
        },
      ]),
    ) as Lab45Output['gates'];
    const summary = METRIC_IDS.map((m) => summaryLine(m, aggregates[m], input.gates[m]));
    for (const line of summary) ctx.log(line.includes('FAIL') ? 'warn' : 'info', line);
    ctx.setResultExtras({
      effective: { mode: ctx.mode, simulated: resolved.simulated, modelId: input.modelId, embedder: embedder.id },
    });
    return {
      config: {
        retrieval: input.retrieval,
        maxSources: input.maxSources,
        generator: resolved.simulated ? `scripted (${input.offlineBehaviour})` : input.modelId,
        embedder: embedder.id,
        simulated: resolved.simulated,
      },
      items,
      aggregates,
      gates,
      summary,
      reproducibility: {
        rescoreIdentical,
        rerunIdentical,
        note:
          rerunIdentical === null
            ? 'live generation varies between runs, so only re-scoring of the stored outputs is checked'
            : 'offline: re-scored and re-run',
      },
    };
  },

  validate(out) {
    const recomputed = aggregatesOf(out.items);
    const summaryOk = METRIC_IDS.every((m, i) => out.summary[i] === summaryLine(m, recomputed[m], out.gates[m].min));
    const missingSamples = out.items.filter(
      (it) => !it.question || METRIC_IDS.some((m) => !('reason' in it.scores[m] || 'notScorable' in it.scores[m])),
    );
    const failed = METRIC_IDS.filter((m) => out.gates[m].pass === false);
    return summarizeChecks([
      {
        id: 'metrics-reproducible',
        label: 'Re-scoring the stored outputs (and, offline, re-running the suite) gives identical metrics',
        passed: out.reproducibility.rescoreIdentical && out.reproducibility.rerunIdentical !== false,
        message: `re-score ${out.reproducibility.rescoreIdentical ? 'identical' : 'DIFFERENT'}; re-run ${out.reproducibility.rerunIdentical === null ? 'not applicable (live)' : out.reproducibility.rerunIdentical ? 'identical' : 'DIFFERENT'}`,
      },
      {
        id: 'samples-visible',
        label: 'Every item shows its question, ground truth, retrieved passages, claims and a reason per metric',
        passed: out.items.length > 0 && missingSamples.length === 0,
        message: `${out.items.length} item(s) with full details`,
      },
      {
        id: 'gates-met',
        label: 'Every metric meets its declared minimum',
        passed: failed.length === 0,
        message: failed.length
          ? failed.map((m) => `${m} ${out.gates[m].mean} < ${out.gates[m].min}`).join('; ')
          : 'all gates pass',
      },
      {
        id: 'summary-verifiable',
        label: 'Every number in the summary is recomputed from the per-item scores',
        passed: summaryOk,
        message: summaryOk ? `${out.summary.length} summary line(s) verified` : 'the summary does not match the item scores',
      },
    ]);
  },
};
