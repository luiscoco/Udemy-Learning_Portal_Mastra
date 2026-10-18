import { z } from 'zod';
import { RequestContext } from '@mastra/core/request-context';
import { createVectorQueryTool } from '@mastra/rag';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { openExactVectorStore } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { resolveEmbedder } from '../lab-38/embedders.js';
import { keywordsOf } from '../lab-39/retrieve.js';
import { withVectorStore } from '../shared/vector-store-lock.js';
import { lab41Definition } from './definition.js';
import { buildFilter, dateNumber, leaksOf, TENANT_CORPUS, validateLearnerFilter, type Filter, type Role } from './filters.js';

export const STORE_FILE = 'lab-41-vectors';

export const Lab41InputSchema = z.object({
  cases: z
    .array(
      z.object({
        tenant: z.enum(['acme', 'globex']),
        role: z.enum(['customer', 'staff']),
        question: z.string().trim().min(3).max(300),
        asOf: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .default('2026-06-01'),
        filter: z.record(z.string(), z.unknown()).optional(),
        expect: z.union([z.literal('none'), z.literal('rejected'), z.object({ docId: z.string().min(1).max(64) })]).optional(),
      }),
    )
    .min(1)
    .max(8),
  tenantScoping: z.enum(['request-context', 'model-filter', 'none']),
  topK: z.number().int().min(1).max(6),
});
export type Lab41Input = z.infer<typeof Lab41InputSchema>;

export interface CaseHit {
  docId: string;
  tenantId: string;
  tags: string[];
  visibility: string;
  effectiveFrom: number;
  effectiveTo: number;
  source: string;
  score: number;
}

export interface CaseOutcome {
  tenant: string;
  role: Role;
  question: string;
  asOf: number;
  status: 'answered' | 'no-results' | 'rejected';
  rejectedReasons: string[];
  appliedFilter: Filter | null;
  filterSource: 'server (requestContext)' | 'model' | 'none';
  hits: CaseHit[];
  leaks: string[];
  answer: { text: string; docId: string; source: string } | null;
  expect: Lab41Input['cases'][number]['expect'] | null;
  expectationMet: boolean | null;
}

export interface Lab41Output {
  tenantScoping: Lab41Input['tenantScoping'];
  embedder: string;
  indexName: string;
  records: number;
  outcomes: CaseOutcome[];
}

/** Simulated "model-chosen" filter (anti-pattern): the tenant named in the question wins over the session. */
export const modelChosenFilter = (question: string, sessionTenant: string) => {
  const named = /\bglobex\b/i.test(question) ? 'globex' : /\bacme\b/i.test(question) ? 'acme' : sessionTenant;
  return JSON.stringify({ tenantId: named });
};

function extract(text: string, question: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => /[a-z]/i.test(s));
  const keys = keywordsOf(question);
  const score = (s: string) => keys.filter((k) => s.toLowerCase().includes(k.replace(/s$/, ''))).length;
  return sentences.reduce((best, s) => (score(s) > score(best) ? s : best), sentences[1] ?? sentences[0] ?? text);
}

export const lab41: LabImplementation<Lab41Input, Lab41Output, LabServices> = {
  definition: lab41Definition as LabDefinition,
  inputSchema: Lab41InputSchema,

  async run(ctx, input) {
    const openaiConfigured = ctx.services.models.liveModels.some((m) => m.provider === 'openai' && m.configured);
    const embedder = resolveEmbedder('default', { mode: ctx.mode, openaiConfigured, dimensions: 0 });
    const indexName = `l41_${embedder.id
      .replace(/^[a-z]+\//, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase()}_${embedder.dimensions}`;
    if (input.tenantScoping !== 'request-context')
      ctx.log('warn', `Tenant scoping "${input.tenantScoping}" (anti-pattern): the tenant is not enforced by the server.`);
    const file = ctx.services.memory.file(STORE_FILE);

    return withVectorStore(
      file,
      async () => {
        const store = await openExactVectorStore(file, [{ indexName, dimension: embedder.dimensions }]);
        try {
          const { embeddings } = await embedder.embed(
            TENANT_CORPUS.map((d) => d.text),
            ctx.signal,
          );
          await store.upsert({
            indexName,
            vectors: embeddings,
            ids: TENANT_CORPUS.map((d) => d.docId), // stable ids: re-runs replace, never duplicate
            metadata: TENANT_CORPUS.map((d) => ({ ...d })),
          });
          const records = (await store.describeIndex({ indexName })).count;
          ctx.emit({ type: 'workflow-step', stepId: 'index-tenant-corpus', status: 'success', output: { indexName, records } });

          const outcomes: CaseOutcome[] = [];
          for (const c of input.cases) {
            ctx.throwIfAborted();
            const asOf = dateNumber(c.asOf);
            const base = { tenant: c.tenant, role: c.role, question: c.question, asOf, expect: c.expect ?? null };
            const reasons = c.filter ? validateLearnerFilter(c.filter) : [];
            if (reasons.length) {
              ctx.log('warn', `${c.tenant}/${c.role}: filter rejected (FILTER_REJECTED): ${reasons.join('; ')}`);
              outcomes.push({
                ...base,
                status: 'rejected',
                rejectedReasons: reasons,
                appliedFilter: null,
                filterSource: 'none',
                hits: [],
                leaks: [],
                answer: null,
                expectationMet: c.expect === undefined ? null : c.expect === 'rejected',
              });
              continue;
            }
            const rc = new RequestContext();
            let applied: Filter | null = null;
            let source: CaseOutcome['filterSource'] = 'none';
            const toolInput: Record<string, unknown> = { queryText: c.question, topK: input.topK };
            if (input.tenantScoping === 'request-context') {
              applied = buildFilter({ tenant: c.tenant, role: c.role, asOf, learner: c.filter });
              rc.set('filter', applied); // overrides any filter the model sends (verified)
              source = 'server (requestContext)';
            } else if (input.tenantScoping === 'model-filter') {
              toolInput.filter = modelChosenFilter(c.question, c.tenant);
              applied = JSON.parse(String(toolInput.filter)) as Filter;
              source = 'model';
            }
            const tool = createVectorQueryTool({
              id: 'searchDocs',
              vectorStore: store as never,
              indexName,
              model: embedder.model() as never,
              enableFilter: input.tenantScoping === 'model-filter',
            });
            const out = (await tool.execute!(toolInput as never, { requestContext: rc } as never)) as {
              relevantContext?: (CaseHit & { text: string })[];
              sources?: { id: string; score: number }[];
            };
            const scores = new Map((out.sources ?? []).map((s) => [s.id, s.score]));
            const ctxHits = out.relevantContext ?? [];
            const hits: CaseHit[] = ctxHits.map((h) => ({
              docId: h.docId,
              tenantId: h.tenantId,
              tags: h.tags,
              visibility: h.visibility,
              effectiveFrom: h.effectiveFrom,
              effectiveTo: h.effectiveTo,
              source: h.source,
              score: Number((scores.get(h.docId) ?? 0).toFixed(4)),
            }));
            const leaks = leaksOf(hits, c.tenant);
            const top = ctxHits[0];
            const outcome: CaseOutcome = {
              ...base,
              status: hits.length ? 'answered' : 'no-results',
              rejectedReasons: [],
              appliedFilter: applied,
              filterSource: source,
              hits,
              leaks,
              answer: top ? { text: extract(top.text, c.question), docId: top.docId, source: top.source } : null,
              expectationMet:
                c.expect === undefined
                  ? null
                  : c.expect === 'none'
                    ? hits.length === 0
                    : c.expect === 'rejected'
                      ? false
                      : top?.docId === c.expect.docId,
            };
            outcomes.push(outcome);
            ctx.emit({
              type: 'workflow-step',
              stepId: `${c.tenant}/${c.role}: ${c.question.slice(0, 36)}`,
              status: leaks.length ? 'failed' : 'success',
              output: { filter: source, hits: hits.map((h) => `${h.docId} (${h.score})`), leaks },
            });
            ctx.log(
              leaks.length ? 'error' : 'info',
              `${c.tenant}/${c.role} @${c.asOf}: ${top ? `${top.docId} — “${outcome.answer!.text}”` : 'no results'}${leaks.length ? `; LEAKED ${leaks.join(', ')}` : ''}`,
            );
          }
          ctx.setResultExtras({ effective: { mode: ctx.mode, simulated: embedder.simulated, embedder: embedder.id, tenantScoping: input.tenantScoping } });
          return { tenantScoping: input.tenantScoping, embedder: embedder.id, indexName, records, outcomes };
        } finally {
          await (store as unknown as { close?: () => Promise<void> }).close?.();
        }
      },
      ctx.signal,
    );
  },

  validate(out, input) {
    const leaked = out.outcomes.filter((o) => o.leaks.length > 0);
    const judged = out.outcomes.filter((o) => o.expectationMet !== null);
    const missed = judged.filter((o) => !o.expectationMet);
    const outOfDate = out.outcomes.filter((o) => o.hits.some((h) => h.effectiveFrom > o.asOf || h.effectiveTo < o.asOf));
    const internalForCustomers = out.outcomes.filter(
      (o) => o.role === 'customer' && o.hits.some((h) => h.visibility !== 'public'),
    );
    const unsafe = input.cases.filter((c) => c.filter && validateLearnerFilter(c.filter).length > 0);
    const unsafeRan = unsafe.filter(
      (c) => out.outcomes.find((o) => o.question === c.question && o.tenant === c.tenant)?.status !== 'rejected',
    );
    return summarizeChecks([
      {
        id: 'no-cross-tenant-results',
        label: 'No case returned another tenant’s documents',
        passed: leaked.length === 0,
        message: leaked.length
          ? leaked.map((o) => `${o.tenant} saw ${o.leaks.join(', ')}`).join('; ')
          : `${out.outcomes.length} case(s), zero cross-tenant results`,
      },
      {
        id: 'filter-fixtures-pass',
        label: 'Each case returned its expected document (or nothing, or a rejection)',
        passed: missed.length === 0,
        message: missed.length
          ? missed
              .map((o) => `${o.tenant}/${o.role} “${o.question.slice(0, 30)}”: got ${o.hits[0]?.docId ?? o.status}`)
              .join('; ')
          : `${judged.length} expectation(s) met`,
      },
      {
        id: 'dates-respected',
        label: 'No document outside its effective dates was returned',
        passed: outOfDate.length === 0,
        message: outOfDate.length
          ? `${outOfDate.length} case(s) got an expired or future document`
          : 'all hits in force on their case’s date',
      },
      {
        id: 'roles-respected',
        label: 'Customers never received internal documents',
        passed: internalForCustomers.length === 0,
        message: internalForCustomers.length
          ? `${internalForCustomers.length} customer case(s) saw internal documents`
          : 'internal notes reached staff only',
      },
      {
        id: 'unsafe-filters-rejected',
        label: 'Learner filters that could widen the tenant scope were rejected before querying',
        passed: unsafeRan.length === 0,
        message: unsafe.length
          ? `${unsafe.length - unsafeRan.length}/${unsafe.length} unsafe filter(s) rejected`
          : 'no unsafe filters in this run',
      },
    ]);
  },
};
