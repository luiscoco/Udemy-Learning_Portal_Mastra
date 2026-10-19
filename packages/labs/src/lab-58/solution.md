# Solution: a versioned dataset and a runner

```ts
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

const mastra = new Mastra({
  agents: { 'faq-agent': agent }, // offline: an agent on a mock (scripted) model
  storage: new LibSQLStore({ id: 'evals', url: 'file:./evals.db' }),
});

// Get or create (create() with an existing id does not throw, so check first).
const dataset = await mastra.datasets.get({ id: 'course-faq' }).catch(() =>
  mastra.datasets.create({ id: 'course-faq', name: 'Course FAQ', metadata: { seedRevision: 0 } }),
);

// Revision 1: idempotent adds (same externalId + payload = no new version).
await dataset.addItem({
  externalId: 'workflow-steps',
  input: 'How does a Mastra workflow run its steps?',
  groundTruth: { rubricId: 'workflow-steps', minScore: 0.7, mustMention: ['step'], mustNotMention: ['random order'] },
});
const v1 = (await dataset.getDetails()).version;

// Revision 2: change through updateItem (a different payload under the same externalId is refused).
await dataset.updateItem({ itemId, groundTruth: { ...tighter } });

// Runner: pinned to a version, scored by deterministic scorers.
const summary = await dataset.startExperiment({
  version: v1,
  targetType: 'agent',
  targetId: 'faq-agent',
  scorers: [rubricScorer, assertionsScorer], // agent targets pass message lists as run.output
  maxConcurrency: 2,
});
for (const r of summary.results) console.log(r.itemId, r.itemVersion, r.scores.map((s) => [s.scorerId, s.score, s.reason]));
console.log((await dataset.listExperiments()).experiments.map((e) => [e.id, e.datasetVersion, e.status]));
```
