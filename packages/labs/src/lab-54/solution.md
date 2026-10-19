# Solution: typed agent steps with retries and error boundaries

```ts
import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';

const Result = <T extends z.ZodType>(v: T) =>
  z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), value: v }), z.object({ ok: z.literal(false), code: z.string() })]);

const RETRIES = 2;
async function boundary<T>(retryCount: number, schema: z.ZodType<T>, attempt: () => Promise<unknown>) {
  if (retryCount > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** (retryCount - 1))); // backoff
  try {
    return { ok: true as const, value: schema.parse(await attempt()) }; // Mastra does not validate step outputs
  } catch (e) {
    if (retryCount < RETRIES) throw e; // Mastra retries the step
    return { ok: false as const, code: (e as Error).name }; // last attempt: contain it
  }
}

const diagnose = createStep({
  id: 'diagnose',
  inputSchema: State,
  outputSchema: State.extend({ diagnosis: Result(Diagnosis) }),
  retries: RETRIES,
  execute: async ({ inputData, retryCount }) => ({
    ...inputData,
    diagnosis: await boundary(retryCount, Diagnosis, async () =>
      (await diagnostician.generate(prompt(inputData), { structuredOutput: { schema: Diagnosis } })).object),
  }),
});

export const workflow = createWorkflow({ id: 'incident', inputSchema: Report, outputSchema: Outcome })
  .then(extract).then(fetchLogs).then(diagnose).then(communicate).then(assemble) // fixed order
  .commit();
// assemble: complete | degraded (no diagnosis, update still published) | failed-safe (no extraction, nothing published)
```
