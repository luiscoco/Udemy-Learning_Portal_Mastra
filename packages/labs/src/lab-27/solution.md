# Solution: a typed sequential pipeline

```ts
const parse = createStep({ id: 'parse', inputSchema: Input, outputSchema: Parsed, execute: async ({ inputData }) => extract(inputData) });
const enrich = createStep({
  id: 'enrich',
  inputSchema: Parsed,
  outputSchema: Enriched,
  execute: async ({ inputData, getInitData }) => addDetails(inputData, getInitData().today),
});
const render = createStep({ id: 'render', inputSchema: RenderInput, outputSchema: Rendered, execute: async ({ inputData }) => toCard(inputData) });

export const pipeline = createWorkflow({ id: 'pipeline', inputSchema: Input, outputSchema: Rendered })
  .then(parse)
  .then(enrich)
  .map(async ({ inputData }) => pickForRender(inputData)) // a mapping step: no schema of its own
  .then(render)
  .commit();
```

Test the order and a broken transition:

```ts
const res = await (await pipeline.createRun()).start({ inputData });
expect(res.stepExecutionPath.filter((s) => !s.startsWith('mapping_'))).toEqual(['parse', 'enrich', 'render']);

// with enrich returning daysUntil: '26 days'
const bad = await (await brokenPipeline.createRun()).start({ inputData });
expect(bad.status).toBe('failed');
expect(bad.error).toMatchObject({ code: 'WORKFLOW_STEP_INPUT_VALIDATION_FAILED' });
```

**Challenge:** add `translate` with `inputSchema: RenderInput` and `outputSchema: RenderInput.extend({ language: z.string() })` between `.map()` and `render`. A bad translation, such as a missing `title`, then fails at `translate`'s output→`render` boundary.
