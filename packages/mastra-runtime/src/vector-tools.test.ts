import { describe, expect, it } from 'vitest';
import { createConceptEmbedder, InMemoryVector, RecordingVector } from './vector-tools.js';

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('createConceptEmbedder (offline stand-in)', () => {
  const embedder = createConceptEmbedder({ groups: [['allergic', 'allergy', 'peanut', 'eat', 'avoid', 'food']], dimensions: 32 });
  const embed = async (t: string) => (await embedder.doEmbed({ values: [t] })).embeddings[0]!;

  it('is deterministic, normalised and labelled as a stand-in', async () => {
    const a = await embed('I am allergic to peanuts');
    expect(await embed('I am allergic to peanuts')).toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect([embedder.provider, embedder.modelId]).toEqual(['offline-sim', 'concept-embedder']);
  });

  it('puts related meanings closer than unrelated ones', async () => {
    const q = await embed('What should I avoid eating?');
    expect(cos(q, await embed("I'm allergic to peanuts."))).toBeGreaterThan(cos(q, await embed('I live in Berlin.')));
  });
});

describe('InMemoryVector + RecordingVector', () => {
  it('scores by cosine, applies $eq filters and records every query', async () => {
    const store = new RecordingVector(new InMemoryVector());
    await store.createIndex({ indexName: 'i', dimension: 2 });
    await store.upsert({
      indexName: 'i',
      vectors: [
        [1, 0],
        [0.9, 0.1],
        [0, 1],
      ],
      metadata: [{ user: 'a' }, { user: 'b' }, { user: 'a' }],
      ids: ['x', 'y', 'z'],
    });
    store.label = 'question';
    const hits = await store.query({ indexName: 'i', queryVector: [1, 0], topK: 2, filter: { user: { $eq: 'a' } } });
    expect(hits.map((h) => h.id)).toEqual(['x', 'z']);
    expect(store.queries).toEqual([
      expect.objectContaining({
        label: 'question',
        topK: 2,
        filter: { user: { $eq: 'a' } },
        hits: [expect.objectContaining({ id: 'x' }), expect.objectContaining({ id: 'z' })],
      }),
    ]);
    expect(store.upserts).toBe(3);
    expect(await store.query({ indexName: 'missing', queryVector: [1, 0] })).toEqual([]);
  });
});
