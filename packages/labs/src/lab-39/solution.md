# Solution: top-k retrieval with thresholds and provenance

```ts
const [queryVector] = (await embedder.doEmbed({ values: [question] })).embeddings; // same model as the index
const hits = (await store.query({ indexName, queryVector, topK: 3 }))
  .filter((h) => h.score >= 0.25) // an unrelated question returns nothing
  .map((h, i) => {
    const s = snippetFor(h.metadata.text, h.metadata.start, keywordsOf(question));
    return { rank: i + 1, score: h.score, source: h.metadata.source, start: s.start, end: s.end, snippet: s.snippet };
  });

if ((await store.describeIndex({ indexName })).count === 0) return { status: 'empty-index', hits: [] };
```

Fixture test: for each known question, the rank-1 hit's document and text contain the expected answer, scores are non-increasing, and `sourceText.slice(start, end) === snippet`.

**Challenge:** embed `"${headingPath}: ${chunk.text}"` but store the original offsets and text in the metadata. Snippets then still point at the source, and the refund rule outranks the bare heading.
