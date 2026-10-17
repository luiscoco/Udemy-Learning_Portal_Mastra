# Solution: bounded foreach with per-item results

```ts
const processDocument = createStep({
  id: 'processDocument',
  inputSchema: Document,
  outputSchema: z.discriminatedUnion('ok', [Success, Failure]),
  execute: async ({ inputData: doc }) => {
    try {
      if (wordCount(doc.text) < 5) throw new ItemError('EMPTY_DOCUMENT', 'too short');
      const r = await agent.generate(doc.text, { structuredOutput: { schema: Summary } });
      return { ok: true, docId: doc.docId, ...r.object };
    } catch (e) {
      return { ok: false, docId: doc.docId, error: toTypedError(e) }; // never throw: keep the batch
    }
  },
});

createWorkflow({ id: 'document-batch', inputSchema: z.array(Document), outputSchema: BatchReport })
  .foreach(processDocument, { concurrency: 2 }) // output array follows input order
  .then(aggregate) // counts + status: empty | complete | partial | all-failed
  .commit();
```

Tests worth having: `[]` (status `empty`), one item (`complete`), many items (order equals input order, peak in flight ≤ the limit), and one failing item (`partial`, with the other results still present).

**Challenge:** wrap the model call in a small loop: retry once when the error is transient (`PROCESSING_FAILED`), never for `EMPTY_DOCUMENT`, and add `attempts` to both result variants.
