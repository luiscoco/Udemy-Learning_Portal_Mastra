import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

export const CATEGORIES = ['billing', 'technical', 'account', 'shipping', 'other'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;
/** Routing table used by the merge (category → queue). */
export const QUEUES: Record<(typeof CATEGORIES)[number], string> = {
  billing: 'billing-queue',
  technical: 'tech-support',
  account: 'account-security',
  shipping: 'logistics',
  other: 'general-inbox',
};

export const TicketSchema = z.object({ ticketId: z.string().regex(/^T-\d{3,6}$/), text: z.string().trim().min(5).max(2_000) });
export const ClassificationSchema = z.object({ category: z.enum(CATEGORIES), priority: z.enum(PRIORITIES) });
export const SummarySchema = z.object({ summary: z.string().min(1).max(200) });
export const JoinedSchema = z.object({ classify: ClassificationSchema, summarize: SummarySchema });
export const TriageSchema = z.object({
  ticketId: z.string(),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string(),
  routedTo: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;
export type Triage = z.infer<typeof TriageSchema>;

/** Pure, order-independent merge: same branch outputs → same record, whichever branch finished first. */
export function mergeTriage(ticketId: string, joined: z.infer<typeof JoinedSchema>): Triage {
  const { category, priority } = joined.classify;
  return { ticketId, category, priority, summary: joined.summarize.summary, routedTo: QUEUES[category] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

export function buildTriageWorkflow(
  agents: { classifier: AnyAgent; summarizer: AnyAgent },
  opts: { failSummarize: boolean; signal?: AbortSignal },
) {
  const classify = createStep({
    id: 'classify',
    description: 'Classifies the ticket (category, priority).',
    inputSchema: TicketSchema,
    outputSchema: ClassificationSchema,
    execute: async ({ inputData }) => {
      const r = await agents.classifier.generate(inputData.text, {
        structuredOutput: { schema: ClassificationSchema },
        abortSignal: opts.signal,
      });
      return ClassificationSchema.parse(r.object);
    },
  });
  const summarize = createStep({
    id: 'summarize',
    description: 'Writes a one-sentence summary of the ticket.',
    inputSchema: TicketSchema,
    outputSchema: SummarySchema,
    execute: async ({ inputData }) => {
      const r = await agents.summarizer.generate(inputData.text, { abortSignal: opts.signal });
      if (opts.failSummarize) throw new Error('summary service unavailable (simulated failure)');
      return { summary: r.text.trim().slice(0, 200) };
    },
  });
  const merge = createStep({
    id: 'merge',
    description: 'Joins both branch outputs into one triage record.',
    inputSchema: JoinedSchema,
    outputSchema: TriageSchema,
    execute: async ({ inputData, getInitData }) =>
      mergeTriage((getInitData() as z.infer<typeof TicketSchema>).ticketId, inputData),
  });
  return createWorkflow({ id: 'triage-workflow', inputSchema: TicketSchema, outputSchema: TriageSchema })
    .parallel([classify, summarize])
    .then(merge)
    .commit();
}
