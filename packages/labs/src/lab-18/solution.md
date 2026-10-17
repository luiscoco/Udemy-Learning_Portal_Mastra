# Solution: a context-aware, safely formatted tool

```ts
const FIELDS = {
  customer: ['name', 'email', 'status', 'total'],
  admin: ['name', 'email', 'status', 'total', 'riskScore'],
} as const;

export const getOrderSummary = createTool({
  id: 'get-order-summary',
  description: 'Order summary for the signed-in caller.',
  inputSchema: z.object({ orderId: z.string() }),
  requestContextSchema: z.object({ role: z.enum(['customer', 'admin']), locale: z.string() }).passthrough(),
  execute: async ({ orderId }, { requestContext }) => {
    const role = requestContext!.get('role') as keyof typeof FIELDS;
    const locale = requestContext!.get('locale') as string;
    const raw = await db.orders.get(orderId); // cache raw data if needed — never the formatted view
    const view = {
      name: raw.name,
      email: role === 'customer' ? raw.email.replace(/^(.).*@/, '$1•••@') : raw.email,
      status: STATUS_LABELS[raw.status][locale],
      total: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(raw.totalCents / 100),
      riskScore: new Intl.NumberFormat(locale, { style: 'percent' }).format(raw.riskScore),
    };
    return Object.fromEntries(Object.entries(view).filter(([k]) => FIELDS[role].includes(k as never)));
  },
});
```

Test two sessions against the same tool instance:

```ts
it('formats per session without contamination', async () => {
  const ctx = (role: string, locale: string) => new RequestContext([['role', role], ['locale', locale]]);
  const admin = await getOrderSummary.execute!({ orderId: 'ORD-3001' }, { requestContext: ctx('admin', 'en-US') } as never);
  const customer = await getOrderSummary.execute!({ orderId: 'ORD-3001' }, { requestContext: ctx('customer', 'de-DE') } as never);
  expect(admin).toHaveProperty('riskScore');
  expect(customer).not.toHaveProperty('riskScore');
  expect(customer.total).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(89.5));
});
```

**Challenge:** add `partner: ['status', 'weight']` to the allowlist. If you need a formatted-output cache, key it by `` `${orderId}:${role}:${locale}` ``. With four mixed sessions, each output then equals `buildView(raw, role, locale)` for its own session.
