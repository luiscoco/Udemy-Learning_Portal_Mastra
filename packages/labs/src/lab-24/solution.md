# Solution: semantic recall with a testable vector store

```ts
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export const memory = new Memory({
  storage: new LibSQLStore({ id: 'app', url: 'file:./memory.db' }),
  vector: new LibSQLVector({ id: 'app-vectors', url: 'file:./vectors.db' }),
  embedder: 'openai/text-embedding-3-small',
  options: {
    lastMessages: 10,
    semanticRecall: { topK: 3, messageRange: 1, scope: 'resource' }, // search all of the user's threads
  },
});
```

Test it without a real vector database. `Memory` accepts any `MastraVector`, so pass a stub that records queries (see `InMemoryVector` and `RecordingVector` in `packages/mastra-runtime/src/vector-tools.ts`) and a deterministic embedder:

```ts
const recorder = new RecordingVector(new InMemoryVector());
const memory = new Memory({ storage, vector: recorder, embedder: fakeEmbedder, options: { semanticRecall: { topK: 2, messageRange: 0, scope: 'resource' } } });

await agent.generate("I'm allergic to peanuts.", { memory: { thread: 'a', resource: 'u1' } });
recorder.label = 'question';
await agent.generate('What should I avoid eating?', { memory: { thread: 'b', resource: 'u1' } });

const q = recorder.queries.find((x) => x.label === 'question')!;
expect(q.filter).toEqual({ resource_id: 'u1' });
expect(q.hits.map((h) => h.metadata?.content)).toContain("I'm allergic to peanuts.");
```

**Challenge:** run both users' questions with the same recorder, labelled per user. Each recorded query's filter must hold only that user's `resource_id`, and every hit's `metadata.resource_id` must match it.
