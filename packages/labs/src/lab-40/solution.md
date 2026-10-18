# Solution: a RAG agent whose citations are verified

```ts
import { createVectorQueryTool } from '@mastra/rag';

const searchDocs = createVectorQueryTool({ id: 'searchDocs', vectorStore: store, indexName: 'docs', model: embeddingModel });

const agent = new Agent({
  id: 'rag-qa',
  instructions: `Call searchDocs first. Reply with JSON only:
{"answer": "...", "supported": true|false, "citations": [{"chunkId": "...", "quote": "<exact sentence>"}]}
Quote verbatim; cite only returned ids; if the chunks do not answer, supported=false and no citations.`,
  model: 'openai/gpt-5-mini',
  tools: { searchDocs },
});

const res = await agent.generate(question, { maxSteps: 4 });
const retrieved = res.toolResults.flatMap((t) => t.payload.result.relevantContext); // ground truth for this run
const verdict = guardAnswer(res.text, retrieved, 0.25);
show(verdict.verdict === 'accepted' ? verdict.shown : { answer: "I can't confirm that from the documents.", citations: [] });
```

The guard rules:
- every cited `chunkId` was retrieved in this run;
- every quote occurs in its chunk;
- the best cited score is at least the threshold;
- every number in the answer occurs in a quote;
- an unsupported answer cites nothing.

**Challenge:** split the answer into sentences and require each one to have its own citation whose quote supports it. Keyword overlap is a simple first test; an entailment check with a second model is a stronger one. Block any sentence left uncovered.
