# Solution: feature-detected Observational Memory

```ts
import { Memory, getObservationsAsOf } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

export function probe(storage: LibSQLStore) {
  return [
    { name: 'export', available: typeof getObservationsAsOf === 'function' },
    { name: 'storage-read-api', available: typeof storage.stores.memory?.getObservationalMemory === 'function' },
  ];
}

const storage = new LibSQLStore({ id: 'app', url: 'file:./memory.db' });
export const memory = new Memory({
  storage,
  options: {
    observationalMemory: {
      model: 'openai/gpt-5-mini', // the Observer (and Reflector)
      observation: { messageTokens: 30_000 }, // production default; use a tiny value only for demos
    },
  },
});
```

Test it with a scripted Observer model and a tiny synchronous threshold:

```ts
const memory = new Memory({
  storage,
  options: { observationalMemory: { model: scriptedObserver, observation: { messageTokens: 120, bufferTokens: false } } },
});
for (const m of longConversation) await agent.generate(m, { memory: ids });
const record = await storage.stores.memory!.getObservationalMemory(ids.thread, ids.resource);
expect(record?.activeObservations).toContain('allergic to peanuts');
```

If the probe fails, a fallback (for example, summarising into working memory) is fine, but label it `fallback (app-level, not Mastra observational memory)` in your results and UI.

**Challenge:** add `reflection: { observationTokens: <small> }` and keep `bufferTokens: false`. After enough turns, the record's `generationCount` increases when the Reflector compresses the observations. Assert that the compressed log still contains the key facts.
