# Solution: a reproducible RAG evaluation with Mastra scorers

```ts
import { createScorer, notScorable } from '@mastra/core/evals';

const hitRate = createScorer({ id: 'retrieval-hit-rate', description: 'A relevant passage was retrieved' })
  .preprocess(({ run }) =>
    run.groundTruth.relevant.length
      ? { found: run.groundTruth.relevant.filter((id) => run.output.retrieved.includes(id)) }
      : notScorable('no relevant passage'),
  )
  .generateScore(({ results }) => (results.preprocessStepResult.found.length ? 1 : 0))
  .generateReason(({ results, score }) => (score ? `hit: ${results.preprocessStepResult.found.join(', ')}` : 'miss'));

for (const item of dataset) {
  const output = await pipeline(item.question); // retrieved ids, raw claim verdicts, shown claims
  const r = await hitRate.run({ input: item, output, groundTruth: item });
  // keep r.score / r.reason / r.notScorable per item
}
```

Report each metric as `sum/n = mean (n, not scorable)`, compare it with a declared gate, and build the summary from those numbers only. Re-score the stored outputs and assert identical results. Offline, run the suite twice.

Score faithfulness on the model's **raw** claims, not on the claims shown after guarding. Measure answer rate too: a system that never answers would otherwise look perfectly faithful.

**Challenge:** an LLM-judged helpfulness scorer, created with `createScorer({ judge: { model, instructions } })` and a `generateScore` prompt. Run it 3 times, report min, median and max, and keep it out of the gates.
