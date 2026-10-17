import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

export const CartItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  unitPriceCents: z.number().int().min(0).max(10_000_000).describe('Price of one unit in cents (integer)'),
  quantity: z.number().int().min(1).max(1000),
});

export const OrderInputSchema = z.object({
  items: z.array(CartItemSchema).min(1).max(20),
  discountPct: z.number().min(0).max(100).default(0).describe('Percentage discount on the subtotal'),
  taxRatePct: z.number().min(0).max(30).default(0).describe('Tax rate applied after the discount'),
});
export type OrderInput = z.infer<typeof OrderInputSchema>;

export const OrderTotalSchema = z.object({
  lines: z.array(z.object({ name: z.string(), quantity: z.number(), unitPriceCents: z.number(), lineTotalCents: z.number() })),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
});
export type OrderTotal = z.infer<typeof OrderTotalSchema>;

/**
 * Pure business logic: integer cents only (no floating-point money), half-up rounding at each step.
 * Discount applies to the subtotal; tax applies to the discounted amount.
 */
export function calculateOrderTotal(input: OrderInput): OrderTotal {
  const lines = input.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    lineTotalCents: i.unitPriceCents * i.quantity,
  }));
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const discountCents = Math.round((subtotalCents * input.discountPct) / 100);
  const taxCents = Math.round(((subtotalCents - discountCents) * input.taxRatePct) / 100);
  return { lines, subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The Mastra tool: schemas validate the model's arguments before `execute` runs. */
export const orderTotalTool = createTool({
  id: 'calculate-order-total',
  description:
    'Calculates an order total from line items (unit price in cents × quantity), an optional percentage discount and a tax rate. Use it for every price calculation.',
  inputSchema: OrderInputSchema,
  outputSchema: OrderTotalSchema,
  execute: async (input) => calculateOrderTotal(input),
});
