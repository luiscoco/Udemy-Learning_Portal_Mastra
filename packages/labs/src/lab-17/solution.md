# Solution: an allowlisted request context

Build the context in your HTTP handler, never from the conversation:

```ts
import { z } from 'zod';
import { RequestContext, isReservedRequestContextKey } from '@mastra/core/request-context';

const TrustedContext = z
  .object({ tenantId: z.string(), userId: z.string(), locale: z.enum(['en-US', 'es-ES']) })
  .strict();

export function contextFor(session: { tenantId: string; userId: string }, headers: Record<string, string>) {
  const locale = headers['x-locale'] ?? 'en-US'; // the only header we accept
  for (const key of Object.keys(headers))
    if (isReservedRequestContextKey(key) || key === 'x-tenant-id') console.warn('rejected header', key);
  const values = TrustedContext.parse({ tenantId: session.tenantId, userId: session.userId, locale });
  return new RequestContext(Object.entries(values));
}
```

The tool takes the tenant from the context, not from its arguments:

```ts
export const listInvoices = createTool({
  id: 'list-invoices',
  description: 'Lists the signed-in customer’s invoices.',
  inputSchema: z.object({ status: z.enum(['open', 'paid', 'all']) }), // no tenantId here
  requestContextSchema: z.object({ tenantId: z.string() }).passthrough(),
  execute: async ({ status }, { requestContext }) => db.invoices(requestContext!.get('tenantId'), status),
});

const agent = new Agent({ /* … */ requestContextSchema: TrustedContext, tools: { listInvoices } });
await agent.generate(message, { requestContext: contextFor(session, req.headers) });
```

Test the injection with a scripted model that passes `{ status: 'open', tenantId: 'globex' }`. Assert that `execute` received `{ status: 'open' }` and that the result contains only the session tenant's invoices.

**Challenge:** in `exportInvoicesCsv.execute`, check `requestContext.get('plan') === 'enterprise'` and otherwise return `{ ok: false, code: 'PLAN_REQUIRED' }`. The plan comes from verified claims, so asking in the message cannot change it.
