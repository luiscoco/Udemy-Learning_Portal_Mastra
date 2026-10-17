# Solution: a typed workflow whose output is checked

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';

const Input = z.object({ email: z.string().min(10), currency: z.enum(['EUR', 'USD']) });
const Quote = z.object({ total: z.number().int(), formattedTotal: z.string() });

const price = createStep({
  id: 'price',
  inputSchema: Input,
  outputSchema: Quote,
  execute: async ({ inputData }) => {
    const total = computeTotal(inputData.email);
    return { total, formattedTotal: format(total, inputData.currency) };
  },
});

export const quoteWorkflow = createWorkflow({ id: 'quote', inputSchema: Input, outputSchema: Quote }).then(price).commit();

export async function runQuote(input: unknown) {
  const res = await (await quoteWorkflow.createRun()).start({ inputData: input as z.infer<typeof Input> }); // throws on invalid input
  if (res.status !== 'success') throw new Error(`workflow ${res.status}`);
  return Quote.parse(res.result); // Mastra does not validate output at runtime: do it here
}
```

Tests:

```ts
await expect(runQuote({ email: '', currency: 'JPY' })).rejects.toThrow(/Invalid input data/);
// with a step that returns { total: '€63.00' }, the workflow status is "success" but:
await expect(runQuote(validInput)).rejects.toThrow(/expected number/);
```

**Challenge:** in `execute`, throw `new Error('Unknown discount code SAVE99')` when `DISCOUNTS[code]` is missing. The step result becomes `failed`, the workflow status is `failed` with the error, and the trace shows the failed step.
