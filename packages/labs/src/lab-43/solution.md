# Solution: guarded, inspectable reranking with Mastra

```ts
import { MastraAgentRelevanceScorer, rerankWithScorer } from '@mastra/rag';

class SafeScorer {
  constructor(private inner: { getRelevanceScore(q: string, t: string): Promise<number> }) {}
  async getRelevanceScore(q: string, t: string) {
    try {
      const s = await this.inner.getRelevanceScore(q, t);
      return Number.isFinite(s) && s >= 0 && s <= 1 ? s : 0; // NaN / out of range → 0 (and log it)
    } catch {
      return 0; // @mastra/rag's agent scorer throws on replies like "Relevance: 0.9"
    }
  }
}

const candidates = await store.query({ indexName, queryVector, topK: 5 }); // metadata must include `text`
const reranked = await rerankWithScorer({
  results: candidates,
  query,
  scorer: new SafeScorer(new MastraAgentRelevanceScorer('rerank', 'openai/gpt-5-mini')),
  options: { weights: { semantic: 0.4, vector: 0.4, position: 0.2 }, topK: 5 },
});

for (const [i, r] of reranked.entries())
  console.log(r.result.id, 'before', candidates.indexOf(r.result) + 1, 'after', i + 1, r.details); // semantic, vector, position
```

Tests to write, using a deterministic scorer such as keyword overlap:
- pin the reranked order and the final score;
- reranking twice is identical;
- every result's metadata deep-equals its candidate's;
- a throwing or NaN scorer is neutralised.

**Challenge:** record accuracy with and without reranking, and count the agent-scorer calls (candidates × questions). The cost per question is calls × average tokens × price. Keep reranking only if the accuracy gained justifies it.
