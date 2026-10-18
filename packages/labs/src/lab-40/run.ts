import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createVectorQueryTool } from '@mastra/rag';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { consumeStream } from '../shared/tool-stream.js';
import { resolveEmbedder } from '../lab-38/embedders.js';
import { buildCorpusIndex, keywordsOf } from '../lab-39/retrieve.js';
import { lab40Definition } from './definition.js';
import { FALLBACK, guardAnswer, numbersIn, parseAnswer, type GuardResult, type RetrievedChunk } from './guard.js';

export const Lab40InputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(300),
        expect: z
          .union([z.literal('unsupported'), z.object({ docId: z.string().min(1).max(64), contains: z.string().min(1).max(120) })])
          .optional(),
      }),
    )
    .min(1)
    .max(5),
  topK: z.number().int().min(1).max(8),
  minScore: z.number().min(-1).max(1),
  guard: z.enum(['on', 'off']),
  offlineBehaviour: z.enum(['faithful', 'overconfident']).default('faithful'),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab40Input = z.infer<typeof Lab40InputSchema>;

export interface QuestionOutcome {
  question: string;
  expect: Lab40Input['questions'][number]['expect'] | null;
  retrieved: { id: string; source: string; score: number }[];
  modelAnswer: string;
  modelClaimedSupported: boolean | null;
  guard: { verdict: GuardResult['verdict']; reasons: GuardResult['reasons'] } | null;
  shown: {
    answer: string;
    supported: boolean;
    citations: { chunkId: string; quote: string; docId: string; source: string; start: number; end: number; score: number }[];
  };
  /** Shown citations that do not pass the citation rules (only possible with the guard off). */
  invalidShownCitations: string[];
}

export interface Lab40Output {
  guard: Lab40Input['guard'];
  minScore: number;
  embedder: string;
  index: { chunks: number };
  outcomes: QuestionOutcome[];
}

const INSTRUCTIONS = `You answer customer questions using ONLY the company documents.
Always call the searchDocs tool first with the user's question.
Then reply with JSON only, no other text:
{"answer": "...", "supported": true|false, "citations": [{"chunkId": "<id from searchDocs>", "quote": "<exact sentence copied from that chunk>"}]}
Rules: quote sentences verbatim from the retrieved chunks; cite only ids that searchDocs returned; every number in the answer must appear in a quote.
If the retrieved chunks do not answer the question, reply {"answer": "The documents don't say.", "supported": false, "citations": []}. Never use outside knowledge.`;

type Ctx = { id: string; text: string; source?: string };
const contextOf = (out: unknown): { ctx: Ctx[]; scores: Map<string, number> } => {
  const o = (out ?? {}) as { relevantContext?: Ctx[]; sources?: { id: string; score: number }[] };
  return { ctx: o.relevantContext ?? [], scores: new Map((o.sources ?? []).map((s) => [s.id, s.score])) };
};

/** Offline agent: search, then quote the best chunk's matching sentence, or refuse (or, overconfident, invent). */
export function offlineScript(opts: { topK: number; minScore: number; behaviour: Lab40Input['offlineBehaviour'] }) {
  return (v: PromptView): ScriptedTurn => {
    if (v.toolResults.length === 0)
      return { toolCalls: [{ toolName: 'searchDocs', input: { queryText: v.lastUser, topK: opts.topK } }] };
    const { ctx, scores } = contextOf(v.toolResults.at(-1)!.output);
    const best = ctx.filter((c) => (scores.get(c.id) ?? 0) >= opts.minScore)[0];
    if (!best) {
      if (opts.behaviour === 'overconfident')
        return {
          text: JSON.stringify({
            answer: 'Yes, students get a 15% discount on all orders.',
            supported: true,
            citations: [{ chunkId: 'C-unknown', quote: 'Students get 15% off.' }],
          }),
        };
      return { text: JSON.stringify({ answer: "The documents don't say.", supported: false, citations: [] }) };
    }
    const sentences = best.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => /[a-z]/i.test(s) && !s.startsWith('#'));
    const keys = keywordsOf(v.lastUser);
    const hitsIn = (s: string) => keys.filter((k) => s.toLowerCase().includes(k.replace(/s$/, ''))).length;
    // The sentence sharing the most question keywords (first wins ties).
    const sentence =
      sentences.reduce<string | undefined>(
        (bestS, s) => (bestS === undefined || hitsIn(s) > hitsIn(bestS) ? s : bestS),
        undefined,
      ) ?? best.text;
    return { text: JSON.stringify({ answer: sentence, supported: true, citations: [{ chunkId: best.id, quote: sentence }] }) };
  };
}

export const lab40: LabImplementation<Lab40Input, Lab40Output, LabServices> = {
  definition: lab40Definition as LabDefinition,
  inputSchema: Lab40InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder('default', { mode: ctx.mode, openaiConfigured, dimensions: 0 });
    const built = await buildCorpusIndex(embedder, 'sections', ctx.signal);
    ctx.log('info', `Indexed ${built.chunks.length} corpus chunk(s) with ${embedder.id}${embedder.simulated ? ' (mock)' : ''}.`);
    const searchDocs = createVectorQueryTool({
      id: 'searchDocs',
      description: 'Search the company documents (support handbook, privacy policy). Returns chunks with ids, text and scores.',
      vectorStore: built.store as never,
      indexName: built.indexName,
      model: embedder.model() as never,
    });
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript({ topK: input.topK, minScore: input.minScore, behaviour: input.offlineBehaviour }),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'rag-qa', name: 'RAG QA Agent', instructions: INSTRUCTIONS, model: resolved.model, tools: { searchDocs } }),
    );
    if (input.guard === 'off') ctx.log('warn', 'Citation guard is OFF (anti-pattern): model answers are shown unchecked.');

    const outcomes: QuestionOutcome[] = [];
    for (const q of input.questions) {
      ctx.throwIfAborted();
      const stream = await agent.stream(q.question, { maxSteps: 4, abortSignal: ctx.signal });
      const res = await consumeStream(ctx as RunContext<unknown>, stream as never, { emitTokens: false });
      const retrieved: RetrievedChunk[] = [];
      for (const t of res.tools.filter((t) => t.toolName === 'searchDocs' && t.status === 'success')) {
        const { ctx: chunks, scores } = contextOf(t.result);
        for (const c of chunks as (Ctx & { docId?: string; start?: number; end?: number })[])
          if (!retrieved.some((r) => r.id === c.id))
            retrieved.push({
              id: c.id,
              docId: c.docId ?? '?',
              source: c.source ?? '?',
              start: c.start ?? 0,
              end: c.end ?? 0,
              text: c.text,
              score: scores.get(c.id) ?? 0,
            });
      }
      const parsed = parseAnswer(res.text);
      const g = guardAnswer(res.text, retrieved, input.minScore);
      const shownRaw =
        input.guard === 'on'
          ? g.shown
          : { answer: parsed?.answer ?? res.text, supported: parsed?.supported ?? false, citations: parsed?.citations ?? [] };
      const byId = new Map(retrieved.map((r) => [r.id, r]));
      const shownCitations = shownRaw.citations.map((c) => {
        const chunk = byId.get(c.chunkId);
        return {
          chunkId: c.chunkId,
          quote: c.quote,
          docId: chunk?.docId ?? '?',
          source: chunk?.source ?? '?',
          start: chunk?.start ?? -1,
          end: chunk?.end ?? -1,
          score: Number((chunk?.score ?? 0).toFixed(4)),
        };
      });
      const invalidShown = shownCitations
        .filter((c) => {
          const chunk = byId.get(c.chunkId);
          return (
            !chunk || !chunk.text.replace(/\s+/g, ' ').toLowerCase().includes(c.quote.replace(/\s+/g, ' ').trim().toLowerCase())
          );
        })
        .map((c) => c.chunkId);
      const outcome: QuestionOutcome = {
        question: q.question,
        expect: q.expect ?? null,
        retrieved: retrieved.map((r) => ({ id: r.id, source: r.source, score: Number(r.score.toFixed(4)) })),
        modelAnswer: res.text.slice(0, 2_000),
        modelClaimedSupported: parsed?.supported ?? null,
        guard: input.guard === 'on' ? { verdict: g.verdict, reasons: g.reasons } : null,
        shown: { answer: shownRaw.answer, supported: shownRaw.supported, citations: shownCitations },
        invalidShownCitations: invalidShown,
      };
      outcomes.push(outcome);
      ctx.emit({
        type: 'workflow-step',
        stepId: `answer: ${q.question.slice(0, 40)}`,
        status: outcome.guard?.verdict === 'blocked' ? 'failed' : 'success',
        output: {
          supported: outcome.shown.supported,
          citations: shownCitations.map((c) => `${c.source}@${c.start}-${c.end}`),
          guard: outcome.guard?.verdict ?? 'off',
        },
      });
      ctx.log(
        outcome.guard?.verdict === 'blocked' ? 'warn' : 'info',
        `"${q.question}": ${outcome.shown.supported ? 'supported' : 'not supported'}${outcome.guard?.verdict === 'blocked' ? ` (blocked: ${outcome.guard.reasons.map((r) => r.code).join(', ')})` : ''} — ${outcome.shown.answer.slice(0, 100)}`,
      );
    }
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: resolved.simulated,
        embedder: embedder.id,
        guard: input.guard,
      },
    });
    return {
      guard: input.guard,
      minScore: input.minScore,
      embedder: embedder.id,
      index: { chunks: built.chunks.length },
      outcomes,
    };
  },

  validate(out) {
    const shownCites = out.outcomes.flatMap((o) => o.shown.citations);
    const invalid = out.outcomes.filter((o) => o.invalidShownCitations.length > 0);
    const answerable = out.outcomes.filter((o) => o.expect && o.expect !== 'unsupported');
    const ungrounded = answerable.filter((o) => {
      const e = o.expect as { docId: string; contains: string };
      const text = `${o.shown.answer} ${o.shown.citations.map((c) => c.quote).join(' ')}`.toLowerCase();
      return (
        !o.shown.supported || !o.shown.citations.some((c) => c.docId === e.docId) || !text.includes(e.contains.toLowerCase())
      );
    });
    const unsupportedQs = out.outcomes.filter((o) => o.expect === 'unsupported');
    const dishonest = unsupportedQs.filter((o) => o.shown.supported || o.shown.citations.length > 0);
    const badNumbers = out.outcomes.filter(
      (o) =>
        o.shown.supported &&
        numbersIn(o.shown.answer).some((n) => !numbersIn(o.shown.citations.map((c) => c.quote).join(' ')).includes(n)),
    );
    const noProvenance = shownCites.filter((c) => c.source === '?' || c.start < 0 || c.end <= c.start);
    return summarizeChecks([
      {
        id: 'citations-map-to-chunks',
        label: 'Every shown citation is a retrieved chunk and its quote appears verbatim in it',
        passed: invalid.length === 0,
        message: invalid.length
          ? invalid.map((o) => `"${o.question}": ${o.invalidShownCitations.join(', ')}`).join('; ')
          : `${shownCites.length} citation(s) verified`,
      },
      {
        id: 'answers-grounded',
        label: 'Answerable questions got a supported answer citing the expected document',
        passed: ungrounded.length === 0,
        message: ungrounded.length
          ? ungrounded
              .map(
                (o) =>
                  `"${o.question}": ${o.guard?.verdict === 'blocked' ? `blocked (${o.guard.reasons.map((r) => r.code).join(', ')})` : o.shown.answer.slice(0, 60)}`,
              )
              .join('; ')
          : `${answerable.length} grounded answer(s)`,
      },
      {
        id: 'unsupported-handled',
        label: 'Questions the documents do not cover were answered honestly, without citations',
        passed: dishonest.length === 0,
        message: dishonest.length
          ? dishonest.map((o) => `"${o.question}": shown as “${o.shown.answer.slice(0, 60)}”`).join('; ')
          : `${unsupportedQs.length} unsupported question(s) handled${out.outcomes.some((o) => o.guard?.verdict === 'blocked') ? ' (the guard blocked at least one answer)' : ''}`,
      },
      {
        id: 'numbers-grounded',
        label: 'Every number in a supported answer appears in a cited quote',
        passed: badNumbers.length === 0,
        message: badNumbers.length ? badNumbers.map((o) => `"${o.question}"`).join('; ') : 'all numbers grounded',
      },
      {
        id: 'provenance-shown',
        label: 'Every shown citation carries its source document, offsets and score',
        passed: noProvenance.length === 0,
        message: noProvenance.length
          ? `${noProvenance.length} citation(s) without provenance`
          : `${shownCites.length} citation(s) with provenance`,
      },
    ]);
  },
};

export { FALLBACK };
