# Solution: parallel branches with a deterministic join

```ts
const merge = createStep({
  id: 'merge',
  inputSchema: z.object({ classify: Classification, summarize: Summary }), // keyed by step id
  outputSchema: Triage,
  execute: async ({ inputData, getInitData }) => mergeTriage(getInitData().ticketId, inputData), // pure
});

export const triage = createWorkflow({ id: 'triage', inputSchema: Ticket, outputSchema: Triage })
  .parallel([classify, summarize])
  .then(merge)
  .commit();
```

Measure, don't guess. Every step record has `startedAt` and `endedAt`:

```ts
const res = await (await triage.createRun()).start({ inputData });
const a = res.steps.classify, b = res.steps.summarize;
const span = Math.max(a.endedAt, b.endedAt) - Math.min(a.startedAt, b.startedAt);
const sequential = (a.endedAt - a.startedAt) + (b.endedAt - b.startedAt);
expect(span).toBeLessThan(sequential);
```

Order independence: run with swapped delays and `expect(mergedA).toEqual(mergedB)`.

**Challenge:** add `detectLanguage` to `.parallel([...])`. The merge input gains a `detectLanguage` key, the routing uses it, and the span stays close to the slowest branch while the sequential sum grows.
