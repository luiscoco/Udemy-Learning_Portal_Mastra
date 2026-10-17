import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

/** Mock inventory (deterministic). In production this would be a database or service call. */
export const INVENTORY: Record<string, { name: string; quantity: number; unitPriceCents: number; warehouse: string }> = {
  'TSH-0042': { name: 'Organic cotton T-shirt', quantity: 12, unitPriceCents: 1999, warehouse: 'Madrid' },
  'MUG-0007': { name: 'Ceramic mug', quantity: 0, unitPriceCents: 1250, warehouse: 'Lisbon' },
  'CAP-0100': { name: 'Baseball cap', quantity: 3, unitPriceCents: 1500, warehouse: 'Madrid' },
};

/** Fixed mock exchange rates from USD (not live market data). */
export const RATES_FROM_USD = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.2 } as const;
export type Currency = keyof typeof RATES_FROM_USD;
const CURRENCIES = Object.keys(RATES_FROM_USD) as [Currency, ...Currency[]];

export const LookupOutput = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    sku: z.string(),
    name: z.string(),
    inStock: z.boolean(),
    quantity: z.number().int(),
    unitPriceCents: z.number().int(),
    warehouse: z.string(),
  }),
  z.object({ found: z.literal(false), sku: z.string() }),
]);
export type LookupResult = z.infer<typeof LookupOutput>;

export function lookupSku(sku: string): LookupResult {
  const item = INVENTORY[sku];
  if (!item) return { found: false, sku };
  return {
    found: true,
    sku,
    name: item.name,
    inStock: item.quantity > 0,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    warehouse: item.warehouse,
  };
}

export function convertAndFormat(amountCents: number, currency: Currency) {
  const converted = (amountCents / 100) * RATES_FROM_USD[currency];
  // JPY has no minor unit: round to whole yen; others to cents.
  const rounded = currency === 'JPY' ? Math.round(converted) : Math.round(converted * 100) / 100;
  return {
    currency,
    rate: RATES_FROM_USD[currency],
    amount: rounded,
    formatted: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(rounded),
  };
}

export const inventoryLookupTool = createTool({
  id: 'inventory-lookup',
  description: 'Looks up a product by SKU (format ABC-1234) and returns stock level and price in USD cents.',
  inputSchema: z.object({ sku: z.string().regex(/^[A-Z]{3}-\d{4}$/) }),
  outputSchema: LookupOutput,
  execute: async ({ sku }) => lookupSku(sku),
});

export const formatCurrencyTool = createTool({
  id: 'format-currency',
  description: 'Converts an amount in USD cents to USD, EUR, GBP or JPY using fixed rates and formats it for display.',
  inputSchema: z.object({ amountCents: z.number().int().min(0), currency: z.enum(CURRENCIES) }),
  outputSchema: z.object({ currency: z.enum(CURRENCIES), rate: z.number(), amount: z.number(), formatted: z.string() }),
  execute: async ({ amountCents, currency }) => convertAndFormat(amountCents, currency),
});
