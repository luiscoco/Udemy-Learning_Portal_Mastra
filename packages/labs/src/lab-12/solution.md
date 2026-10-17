# Solution — a discriminated-union tool input with tests

```ts
import { z } from 'zod';

export const Input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refund'), orderId: z.string().regex(/^ORD-\d{6}$/, 'Order ids look like ORD-123456'), amountCents: z.number().int().positive().max(50_000, 'Refunds above $500 need a human') }),
  z.object({ action: z.literal('exchange'), orderId: z.string().regex(/^ORD-\d{6}$/), sku: z.string().regex(/^[A-Z]{3}-\d{4}$/), size: z.enum(['S', 'M', 'L']) }),
  z.object({ action: z.literal('cancel'), orderId: z.string().regex(/^ORD-\d{6}$/), confirm: z.literal(true) }),
]);
```

Tests:

```ts
it('accepts a valid refund', () => expect(Input.safeParse({ action: 'refund', orderId: 'ORD-000001', amountCents: 100 }).success).toBe(true));
it('rejects a big refund', () => {
  const r = Input.safeParse({ action: 'refund', orderId: 'ORD-000001', amountCents: 60_000 });
  expect(r.success).toBe(false);
  expect(r.error!.issues[0]!.path).toEqual(['amountCents']);
});
it('rejects an exchange without size', () => expect(Input.safeParse({ action: 'exchange', orderId: 'ORD-000001', sku: 'TSH-0042' }).success).toBe(false));
it('rejects cancel with confirm: false', () => expect(Input.safeParse({ action: 'cancel', orderId: 'ORD-000001', confirm: false }).success).toBe(false));
```

**Challenge:** `z.literal(true)` accepts only `true`, so `confirm: false` produces an "Invalid input: expected true" error on `confirm` and the cancel never runs.
