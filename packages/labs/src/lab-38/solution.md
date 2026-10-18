# Solution: embeddings in a well-kept vector index

```ts
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { LibSQLVector } from '@mastra/libsql';

const model = new ModelRouterEmbeddingModel('openai/text-embedding-3-small');
const store = new LibSQLVector({ id: 'docs', url: 'file:./vectors.db' });
const indexName = 'docs_text_embedding_3_small_1536'; // one model + dimension per index

const { embeddings, usage } = await model.doEmbed({ values: chunks.map((c) => c.text) });

const existing = (await store.listIndexes()).includes(indexName) ? await store.describeIndex({ indexName }) : null;
if (existing && existing.dimension !== 1536) throw new Error('DIMENSION_MISMATCH'); // createIndex would not tell you
if (!existing) await store.createIndex({ indexName, dimension: 1536, metric: 'cosine' });

await store.upsert({
  indexName,
  vectors: embeddings,
  ids: chunks.map((c) => sha256(`${c.docId}|${c.start}|${c.end}|${c.text}`).slice(0, 24)), // idempotent
  metadata: chunks.map((c) => ({ docId: c.docId, source: c.source, start: c.start, end: c.end, text: c.text })),
});
```

Write three tests:
- a second upsert keeps `describeIndex().count`;
- `query({ queryVector: ownVector, topK: 1 })` returns the record itself with intact metadata;
- with the mock embedder, re-embedding gives identical vectors (use cosine for providers).

**Challenge:** before re-ingesting an edited document, delete its old records with `deleteVectors({ indexName, filter: { docId } })`, or delete the ids that are no longer produced. Then the count equals the new chunk count.
