import { z } from 'zod';

/**
 * A generated answer whose claims cite source passages. Labs put it at `output.citedAnswer`; the web Run
 * tab renders it with citations that open the passage (quote offsets index into `sources[id].text`).
 */
export const CitationSchema = z.object({
  n: z.number().int().min(1),
  sourceId: z.string().min(1).max(120),
  quote: z.string().min(1).max(1_000),
  quoteStart: z.number().int().nonnegative(),
  quoteEnd: z.number().int().positive(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const CitedAnswerSchema = z.object({
  claims: z.array(z.object({ text: z.string().min(1).max(2_000), citations: z.array(CitationSchema).min(1).max(8) })).max(20),
  sources: z.record(
    z.string(),
    z.object({ title: z.string().max(200), location: z.string().max(300), text: z.string().max(20_000) }),
  ),
  blocked: z.array(z.object({ text: z.string().max(2_000), reasons: z.array(z.string().max(300)).max(10) })).max(20),
  fallback: z.boolean(),
});
export type CitedAnswer = z.infer<typeof CitedAnswerSchema>;
