import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

export const MIN_WORDS = 5;
export const MAX_KEYWORDS = 5;

export const DocumentSchema = z.object({
  docId: z.string().regex(/^D-\d{1,4}$/),
  title: z.string().trim().min(1).max(120),
  text: z.string().max(4_000),
  /** Makes this item fail on purpose (simulates a provider or parsing error). */
  simulateFailure: z.boolean().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const ItemErrorSchema = z.object({ code: z.enum(['EMPTY_DOCUMENT', 'PROCESSING_FAILED']), message: z.string() });
export const ItemResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    docId: z.string(),
    title: z.string(),
    wordCount: z.number().int(),
    summary: z.string(),
    keywords: z.array(z.string()).max(MAX_KEYWORDS),
  }),
  z.object({ ok: z.literal(false), docId: z.string(), title: z.string(), error: ItemErrorSchema }),
]);
export type ItemResult = z.infer<typeof ItemResultSchema>;

export const BatchReportSchema = z.object({
  status: z.enum(['empty', 'complete', 'partial', 'all-failed']),
  total: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  totalWords: z.number().int(),
  topKeywords: z.array(z.string()),
  results: z.array(ItemResultSchema),
});
export type BatchReport = z.infer<typeof BatchReportSchema>;

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Pure aggregation: counts, input-ordered results, and keywords ranked by frequency then name. */
export function aggregateResults(results: ItemResult[]): BatchReport {
  const ok = results.filter((r): r is Extract<ItemResult, { ok: true }> => r.ok);
  const freq = new Map<string, number>();
  for (const r of ok) for (const k of new Set(r.keywords.map((k) => k.toLowerCase()))) freq.set(k, (freq.get(k) ?? 0) + 1);
  const topKeywords = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_KEYWORDS).map(([k]) => k);
  const status =
    results.length === 0 ? 'empty' : ok.length === results.length ? 'complete' : ok.length === 0 ? 'all-failed' : 'partial';
  return {
    status,
    total: results.length,
    succeeded: ok.length,
    failed: results.length - ok.length,
    totalWords: ok.reduce((n, r) => n + r.wordCount, 0),
    topKeywords,
    results,
  };
}

export type FailureHandling = 'capture' | 'throw';

/** Concurrency actually observed inside the step (app-level measurement; Mastra does not report it). */
export class InFlight {
  active = 0;
  peak = 0;
  enter() {
    this.active++;
    this.peak = Math.max(this.peak, this.active);
  }
  leave() {
    this.active--;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export class ItemError extends Error {
  constructor(
    readonly code: z.infer<typeof ItemErrorSchema>['code'],
    message: string,
  ) {
    super(message);
  }
}

export function buildBatchWorkflow(
  agent: AnyAgent,
  opts: { concurrency: number; failureHandling: FailureHandling; simulatedLatencyMs: number; inFlight: InFlight; signal?: AbortSignal },
) {
  const processDocument = createStep({
    id: 'processDocument',
    description: 'Summarises one document; failures become typed per-item errors (or throw, in the contrast mode).',
    inputSchema: DocumentSchema,
    outputSchema: ItemResultSchema,
    execute: async ({ inputData: doc }) => {
      opts.inFlight.enter();
      try {
        if (opts.simulatedLatencyMs > 0) await new Promise((r) => setTimeout(r, opts.simulatedLatencyMs));
        const words = wordCount(doc.text);
        if (words < MIN_WORDS) throw new ItemError('EMPTY_DOCUMENT', `only ${words} word(s); at least ${MIN_WORDS} are needed`);
        if (doc.simulateFailure) throw new ItemError('PROCESSING_FAILED', 'simulated processing failure');
        const r = await agent.generate(`Title: ${doc.title}\n\n${doc.text}`, {
          structuredOutput: {
            schema: z.object({ summary: z.string(), keywords: z.array(z.string()).max(MAX_KEYWORDS) }),
          },
          abortSignal: opts.signal,
        });
        const o = r.object as { summary: string; keywords: string[] };
        return { ok: true as const, docId: doc.docId, title: doc.title, wordCount: words, summary: o.summary, keywords: o.keywords.slice(0, MAX_KEYWORDS) };
      } catch (e) {
        if (opts.failureHandling === 'throw' || opts.signal?.aborted) throw e;
        const error =
          e instanceof ItemError
            ? { code: e.code, message: e.message }
            : { code: 'PROCESSING_FAILED' as const, message: 'the model call failed' };
        return { ok: false as const, docId: doc.docId, title: doc.title, error };
      } finally {
        opts.inFlight.leave();
      }
    },
  });
  const aggregate = createStep({
    id: 'aggregate',
    description: 'Counts, input-ordered results and top keywords.',
    inputSchema: z.array(ItemResultSchema),
    outputSchema: BatchReportSchema,
    execute: async ({ inputData }) => aggregateResults(inputData),
  });
  return createWorkflow({ id: 'document-batch', inputSchema: z.array(DocumentSchema), outputSchema: BatchReportSchema })
    .foreach(processDocument, { concurrency: opts.concurrency })
    .then(aggregate)
    .commit();
}
