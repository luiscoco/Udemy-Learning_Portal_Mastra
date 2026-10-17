# Solution — an order-total tool in your project

`src/mastra/tools/order-total.ts`:

```ts
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

export const Order = z.object({
  items: z.array(z.object({ name: z.string(), unitPriceCents: z.number().int().min(0), quantity: z.number().int().min(1) })).min(1),
  discountPct: z.number().min(0).max(100).default(0),
  taxRatePct: z.number().min(0).max(30).default(0),
});

export function total(o: z.infer<typeof Order>) {
  const subtotal = o.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const discount = Math.round((subtotal * o.discountPct) / 100);
  const tax = Math.round(((subtotal - discount) * o.taxRatePct) / 100);
  return { subtotalCents: subtotal, discountCents: discount, taxCents: tax, totalCents: subtotal - discount + tax };
}

export const orderTotalTool = createTool({
  id: 'calculate-order-total',
  description: 'Calculates an order total in cents. Use it for every price calculation.',
  inputSchema: Order,
  outputSchema: z.object({ subtotalCents: z.number(), discountCents: z.number(), taxCents: z.number(), totalCents: z.number() }),
  execute: async (input) => total(input),
});
```

Agent and registration:

```ts
export const checkoutAgent = new Agent({
  id: 'checkout-agent',
  name: 'Checkout',
  instructions: 'Always call calculateOrderTotal for price math.',
  model: 'openai/gpt-5-mini',
  tools: { calculateOrderTotal: orderTotalTool },
});

export const mastra = new Mastra({ agents: { checkoutAgent }, tools: { calculateOrderTotal: orderTotalTool } });
```

Test (`total.test.ts`): `expect(total({ items: [{ name: 'x', unitPriceCents: 450, quantity: 3 }], discountPct: 10, taxRatePct: 8 }).totalCents).toBe(1312);`

**Challenge (shipping):** add `shippingCents: z.number().int().min(0).default(0)` and `const shipping = subtotal - discount >= 5000 ? 0 : o.shippingCents;` then add it to the total.
