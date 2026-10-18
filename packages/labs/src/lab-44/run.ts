import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type CitedAnswer, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, InMemoryVector, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { numbersIn } from '../lab-40/guard.js';
import { resolveEmbedder } from '../lab-38/embedders.js';
import { bm25Scores, fuse, rank, tokenize } from '../lab-42/hybrid.js';
import { PASSAGES } from '../lab-42/passages.js';
import { lab44Definition } from './definition.js';
import { guardClaims, type SourcePassage } from './claims.js';

export const Lab44InputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(300),
        expect: z.object({ sources: z.array(z.string().min(1).max(64)).max(6) }).optional(),
      }),
    )
    .min(1)
    .max(4),
  maxSources: z.number().int().min(1).max(6),
  guard: z.enum(['on', 'off']),
  offlineBehaviour: z.enum(['faithful', 'sloppy']).default('faithful'),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab44Input = z.infer<typeof Lab44InputSchema>;

export interface QuestionResult {
  question: string;
  expectSources: string[] | null;
  retrieved: { id: string; fused: number }[];
  modelReply: string;
  verdicts: ReturnType<typeof guardClaims>['verdicts'];
  citedAnswer: CitedAnswer;
}

export interface Lab44Output {
  guard: Lab44Input['guard'];
  /** The first question's answer: what the Run tab renders with openable citations. */
  citedAnswer: CitedAnswer;
  results: QuestionResult[];
}

export const INSTRUCTIONS = `You answer customer questions using ONLY the numbered sources in the message.
Reply with JSON only: {"claims": [{"text": "<one fact>", "citations": [{"id": "<source id>", "quote": "<sentence copied exactly from that source>"}]}]}
Rules: one fact per claim; every claim cites at least one source id from the list; quotes are copied verbatim; numbers only if they appear in the quote; no claim without a source. If the sources do not answer the question, reply {"claims": []}.`;

export const promptFor = (question: string, sources: SourcePassage[]) =>
  `Question: ${question}\n\nSources:\n${sources.map((s) => `[${s.id}] ${s.text}`).join('\n')}`;

/** Offline agent: one claim per source that shares a question keyword, quoting its best sentence. */
export function offlineScript(behaviour: Lab44Input['offlineBehaviour']) {
  return (v: PromptView): ScriptedTurn => {
    const question = /^Question:\s*(.*)$/m.exec(v.lastUser)?.[1] ?? '';
    const sources = [...v.lastUser.matchAll(/^\[([^\]]+)\]\s+(.+)$/gm)].map((m) => ({ id: m[1]!, text: m[2]! }));
    // Each facet of the question ("…declined and I want a refund") is answered by at most one source:
    // the one covering at least half of that facet's keywords (so a single shared word is not enough).
    const facets = question
      .split(/\band\b|[,:;?]/i)
      .map((f) => tokenize(f).map((k) => k.replace(/s$/, '')))
      .filter((k) => k.length > 0);
    const hitsIn = (keys: string[], s: string) => keys.filter((k) => s.toLowerCase().includes(k)).length;
    const claims: { text: string; citations: { id: string; quote: string }[] }[] = [];
    const used = new Set<string>();
    for (const keys of facets) {
      const ranked = sources.map((s) => ({ s, h: hitsIn(keys, s.text) })).sort((a, b) => b.h - a.h);
      const top = ranked[0];
      if (!top || top.h / keys.length < 0.5 || used.has(top.s.id)) continue;
      used.add(top.s.id);
      const sentences = top.s.text.split(/(?<=[.!?])\s+/);
      const best = sentences.reduce((a, b) => (hitsIn(keys, b) > hitsIn(keys, a) ? b : a), sentences[0]!);
      claims.push({ text: best, citations: [{ id: top.s.id, quote: best }] });
    }
    if (behaviour === 'sloppy' && sources.length) {
      const first = sources[0]!;
      claims.push(
        {
          text: 'Premium customers get a 20% loyalty discount.',
          citations: [{ id: 'kb-999', quote: 'Premium customers get 20% off.' }],
        },
        {
          text: `In short: ${first.text.split(/(?<=[.!?])\s+/)[0]}`,
          citations: [{ id: first.id, quote: 'A paraphrase that the source never says.' }],
        },
        {
          text: 'Refunds can be requested within 60 days of delivery.',
          citations: [{ id: 'refunds', quote: 'Customers can request a refund within 30 days of delivery.' }],
        },
      );
    }
    return { text: JSON.stringify({ claims }) };
  };
}

export const lab44: LabImplementation<Lab44Input, Lab44Output, LabServices> = {
  definition: lab44Definition as LabDefinition,
  inputSchema: Lab44InputSchema,

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
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(input.offlineBehaviour),
    });
    const agent = withLabLogger(
      ctx,
      new Agent({ id: 'cited-answerer', name: 'Cited Answerer', instructions: INSTRUCTIONS, model: resolved.model }),
    );
    if (input.guard === 'off') ctx.log('warn', 'Claim guard OFF (anti-pattern): every claim is shown as the model wrote it.');

    const results: QuestionResult[] = [];
    for (const q of input.questions) {
      ctx.throwIfAborted();
      // Retrieval: lab 42's hybrid search (BM25 + vector, RRF).
      const kwRaw = bm25Scores(PASSAGES, q.question);
      const keyword = new Map(
        [...rank(new Map([...kwRaw].map(([id, v]) => [id, v.score])))].map(([id, r]) => [
          id,
          { ...r, matched: kwRaw.get(id)?.matched ?? [] },
        ]),
      );
      const [qv] = (await embedder.embed([q.question], ctx.signal)).embeddings;
      const vector = rank(
        new Map(
          (await store.query({ indexName: 'passages', queryVector: qv!, topK: PASSAGES.length })).map((h) => [h.id, h.score]),
        ),
        0.25 - 1e-9,
      );
      const fused = fuse(keyword, vector, 'rrf', { k: 60, alpha: 0.5 }).slice(0, input.maxSources);
      const sources: SourcePassage[] = fused.map((f) => {
        const p = PASSAGES.find((x) => x.id === f.id)!;
        return { id: p.id, title: p.source.split('#')[0]!, location: p.source, text: p.text };
      });
      ctx.emit({
        type: 'workflow-step',
        stepId: `retrieve: ${q.question.slice(0, 40)}`,
        status: 'success',
        output: { sources: fused.map((f) => `${f.id} (${f.fused})`) },
      });

      const reply = sources.length
        ? (await agent.generate(promptFor(q.question, sources), { abortSignal: ctx.signal })).text
        : '{"claims": []}';
      const g = guardClaims(reply, sources, { enforce: input.guard === 'on' });
      results.push({
        question: q.question,
        expectSources: q.expect?.sources ?? null,
        retrieved: fused.map((f) => ({ id: f.id, fused: f.fused })),
        modelReply: reply.slice(0, 3_000),
        verdicts: g.verdicts,
        citedAnswer: g.citedAnswer,
      });
      ctx.emit({
        type: 'workflow-step',
        stepId: `answer: ${q.question.slice(0, 40)}`,
        status: g.verdicts.some((v) => !v.accepted) ? 'failed' : 'success',
        output: {
          shown: g.citedAnswer.claims.length,
          blocked: g.verdicts.filter((v) => !v.accepted).map((v) => v.reasons.map((r) => r.code).join('+')),
        },
      });
      ctx.log(
        g.verdicts.some((v) => !v.accepted) ? 'warn' : 'info',
        `"${q.question}": ${g.citedAnswer.claims.length} claim(s) shown, ${g.verdicts.filter((v) => !v.accepted).length} with unmatched citations${input.guard === 'on' ? ' blocked' : ' (shown anyway: guard off)'}`,
      );
    }
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        simulated: resolved.simulated,
        modelId: input.modelId,
        embedder: embedder.id,
        guard: input.guard,
      },
    });
    return { guard: input.guard, citedAnswer: results[0]!.citedAnswer, results };
  },

  validate(out) {
    const shown = out.results.flatMap((r) => r.citedAnswer.claims.map((c) => ({ r, c })));
    const uncited = shown.filter(({ c }) => c.citations.length === 0);
    const honest = out.results.every((r) => r.citedAnswer.claims.length > 0 || r.citedAnswer.fallback);
    const invalidShown = out.results.flatMap((r) =>
      r.citedAnswer.claims.filter((c) => {
        const v = r.verdicts.find((x) => x.text === c.text);
        return v ? !v.accepted : false;
      }),
    );
    const notOpenable = shown.flatMap(({ r, c }) =>
      c.citations.filter((cit) => {
        const src = r.citedAnswer.sources[cit.sourceId];
        return (
          !src ||
          src.text.slice(cit.quoteStart, cit.quoteEnd).replace(/\s+/g, ' ').toLowerCase() !==
            cit.quote.replace(/\s+/g, ' ').toLowerCase()
        );
      }),
    );
    const badNumbers = shown.filter(({ c }) =>
      numbersIn(c.text).some((n) => !numbersIn(c.citations.map((x) => x.quote).join(' ')).includes(n)),
    );
    const judged = out.results.filter((r) => r.expectSources !== null);
    const missing = judged.filter((r) => {
      const cited = new Set(r.citedAnswer.claims.flatMap((c) => c.citations.map((x) => x.sourceId)));
      return r.expectSources!.some((s) => !cited.has(s)) || (r.expectSources!.length === 0 && cited.size > 0);
    });
    return summarizeChecks([
      {
        id: 'every-claim-cited',
        label: 'Every shown claim cites a source (or the answer honestly says it cannot confirm anything)',
        passed: uncited.length === 0 && honest,
        message: `${shown.length} claim(s) shown across ${out.results.length} question(s); ${out.results.filter((r) => r.citedAnswer.fallback).length} honest fallback(s)`,
      },
      {
        id: 'unmatched-citations-blocked',
        label: 'No claim with an unmatched citation was shown',
        passed: invalidShown.length === 0,
        message: invalidShown.length
          ? `${invalidShown.length} unverified claim(s) shown: ${invalidShown.map((c) => `“${c.text.slice(0, 40)}”`).join('; ')}`
          : `${out.results.reduce((n, r) => n + r.citedAnswer.blocked.length, 0)} claim(s) blocked`,
      },
      {
        id: 'sources-openable',
        label: 'Every citation opens its source passage at the quoted text',
        passed: notOpenable.length === 0,
        message: notOpenable.length
          ? `${notOpenable.length} citation(s) do not resolve to their quote`
          : `${shown.reduce((n, { c }) => n + c.citations.length, 0)} citation(s) resolve`,
      },
      {
        id: 'numbers-grounded',
        label: 'Every number in a shown claim appears in its cited quotes',
        passed: badNumbers.length === 0,
        message: badNumbers.length ? badNumbers.map(({ c }) => `“${c.text.slice(0, 50)}”`).join('; ') : 'all numbers grounded',
      },
      {
        id: 'expected-sources-cited',
        label: 'Each question cited the sources it should (and nothing for unanswerable ones)',
        passed: missing.length === 0,
        message: missing.length
          ? missing.map((r) => `"${r.question}": expected ${r.expectSources!.join(', ') || 'none'}`).join('; ')
          : `${judged.length} question(s) as expected`,
      },
    ]);
  },
};
