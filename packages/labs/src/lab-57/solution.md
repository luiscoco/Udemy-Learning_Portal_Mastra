# Solution: a deterministic rubric scorer

```ts
import { createScorer, notScorable } from '@mastra/core/evals';

const rubric = {
  keyPoints: [
    { id: 'order', aliases: ['fixed order', 'explicit order', 'in order'] },
    { id: 'schemas', aliases: ['input schema', 'output schema'] },
    { id: 'chaining', aliases: ['becomes the input', 'to the next step'] },
  ],
  topic: ['workflow', 'step', 'schema', 'run'],
  forbidden: ['random order'],
};

export const scorer = createScorer({ id: 'rubric', description: 'Completeness and relevance against a rubric' })
  .preprocess(({ run }) => {
    const text = String(run.output ?? '');
    if (text.split(/\s+/).filter(Boolean).length < 3) return notScorable('fewer than 3 words'); // no fake 0
    return { sentences: text.split(/(?<=[.!?])\s+/).map((s) => s.toLowerCase()) };
  })
  .analyze(({ results }) => {
    const ss = results.preprocessStepResult.sentences;
    return {
      covered: rubric.keyPoints.map((k) => ({ id: k.id, evidence: ss.find((s) => k.aliases.some((a) => s.includes(a))) ?? null })),
      onTopic: ss.filter((s) => rubric.topic.some((t) => s.includes(t))).length / ss.length,
      forbidden: rubric.forbidden.filter((f) => ss.some((s) => s.includes(f))),
    };
  })
  .generateScore(({ results: { analyzeStepResult: a } }) => {
    const completeness = a.covered.filter((c) => c.evidence).length / a.covered.length;
    return Math.max(0, Math.min(1, 0.6 * completeness + 0.4 * a.onTopic - 0.35 * a.forbidden.length));
  })
  .generateReason(({ results: { analyzeStepResult: a }, score }) =>
    `missing: ${a.covered.filter((c) => !c.evidence).map((c) => c.id).join(', ') || 'none'}; score ${score}`);

// Golden fixtures: the reference answer must score 1; a partial, an off-topic and an empty answer are pinned too.
const r = await scorer.run({ input: { question }, output: answer });
console.log(r.score, r.reason, r.analyzeStepResult); // the step results are the evidence
```
