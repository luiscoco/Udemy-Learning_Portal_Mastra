# Solution — two tools and an ordered-call test

```ts
export const shopAgent = new Agent({
  id: 'shop-agent',
  name: 'Shop',
  instructions: 'Use inventoryLookup for each SKU, then formatCurrency for each found price. Never invent prices.',
  model: 'openai/gpt-5-mini',
  tools: { inventoryLookup: inventoryLookupTool, formatCurrency: formatCurrencyTool },
  defaultOptions: { maxSteps: 5 },
});
```

Test the order of calls by streaming and collecting tool names:

```ts
it('looks up before formatting', async () => {
  const out = await shopAgent.stream('Is TSH-0042 in stock and how much in EUR?', { maxSteps: 5 });
  const calls: string[] = [];
  for await (const c of out.fullStream) if (c.type === 'tool-call') calls.push(c.payload.toolName);
  expect(calls.indexOf('inventoryLookup')).toBeLessThan(calls.indexOf('formatCurrency'));
});
```

In unit tests, give the agent a scripted model (as this platform does) so the order is deterministic.

**Challenge:** with lookup → shipping + format (parallel) → answer, the agent needs three steps; keep `maxSteps` at 5 or 6.
