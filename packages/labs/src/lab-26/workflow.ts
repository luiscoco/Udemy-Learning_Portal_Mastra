import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

/** Mock product catalog; prices in EUR cents. */
export const CATALOG = {
  'MUG-01': { name: 'Ceramic mug', priceCents: 1250, words: ['mug', 'mugs'] },
  'CAP-02': { name: 'Baseball cap', priceCents: 1500, words: ['cap', 'caps'] },
  'TSH-03': { name: 'T-shirt', priceCents: 1999, words: ['t-shirt', 't-shirts', 'tshirt', 'tshirts'] },
  'BAG-04': { name: 'Tote bag', priceCents: 900, words: ['tote bag', 'tote bags', 'bag', 'bags'] },
} as const;
export type Sku = keyof typeof CATALOG;
export const SKUS = Object.keys(CATALOG) as [Sku, ...Sku[]];

/** Fixed demo exchange rates from EUR (not market data). */
export const RATES = { EUR: 1, USD: 1.09, GBP: 0.86 } as const;
export type Currency = keyof typeof RATES;
export const DISCOUNTS: Record<string, { percent: number; description: string }> = {
  WELCOME10: { percent: 10, description: '10% off the first order' },
  BULK5: { percent: 5, description: '5% off' },
};

// ---- Schemas: the workflow's contract ----
export const QuoteInputSchema = z.object({
  email: z.string().trim().min(10, 'The order email must have at least 10 characters').max(2_000),
  currency: z.enum(['EUR', 'USD', 'GBP']),
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

export const QuoteSchema = z.object({
  currency: z.enum(['EUR', 'USD', 'GBP']),
  lines: z.array(
    z.object({
      sku: z.enum(SKUS),
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().int().nonnegative(),
      lineTotal: z.number().int().nonnegative(),
    }),
  ),
  subtotal: z.number().int().nonnegative(),
  discountCode: z.string().nullable(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  formattedTotal: z.string(),
});
export type Quote = z.infer<typeof QuoteSchema>;

/** What the agent must extract from the email (structured output). */
export const ExtractionSchema = z.object({
  items: z.array(z.object({ sku: z.enum(SKUS), quantity: z.number().int().min(1).max(99) })).max(10),
  discountCode: z.string().nullable(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const fx = (eurCents: number, currency: Currency) => Math.round(eurCents * RATES[currency]);

/** Deterministic pricing from the catalog: the same function the checks use as the oracle. */
export function priceOrder(extraction: Extraction, currency: Currency): Quote {
  const lines = extraction.items.map(({ sku, quantity }) => {
    const unitPrice = fx(CATALOG[sku].priceCents, currency);
    return { sku, name: CATALOG[sku].name, quantity, unitPrice, lineTotal: unitPrice * quantity };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const code = extraction.discountCode?.toUpperCase() ?? null;
  const rule = code ? DISCOUNTS[code] : undefined;
  const discount = rule ? Math.round((subtotal * rule.percent) / 100) : 0;
  const total = subtotal - discount;
  return {
    currency,
    lines,
    subtotal,
    discountCode: rule ? code : null,
    discount,
    total,
    formattedTotal: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(total / 100),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = Agent<any, any, any, any, any>;

/**
 * The workflow: input schema → ONE typed step → output schema. The step asks the agent for a typed
 * extraction, then prices it. `buggy` simulates a step that breaks its own output contract.
 */
export function buildQuoteWorkflow(agent: AnyAgent, opts: { buggy: boolean; signal?: AbortSignal }) {
  const extractAndPrice = createStep({
    id: 'extract-and-price',
    description: 'Extracts the ordered items from the email and prices them from the catalog.',
    inputSchema: QuoteInputSchema,
    outputSchema: QuoteSchema,
    execute: async ({ inputData }) => {
      const res = await agent.generate(inputData.email, {
        structuredOutput: { schema: ExtractionSchema },
        abortSignal: opts.signal,
      });
      const extraction = ExtractionSchema.parse(res.object);
      const quote = priceOrder(extraction, inputData.currency);
      // A bug Mastra will not catch: the step promises a number but returns a string.
      return opts.buggy ? ({ ...quote, total: quote.formattedTotal } as unknown as Quote) : quote;
    },
  });
  return createWorkflow({ id: 'quote-workflow', inputSchema: QuoteInputSchema, outputSchema: QuoteSchema })
    .then(extractAndPrice)
    .commit();
}
