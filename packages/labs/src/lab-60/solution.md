# Solution: a dashboard from stored runs

```ts
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability } from '@mastra/observability';

const storage = new LibSQLStore({ id: 'quality', url: 'file:./quality.db' });
const mastra = new Mastra({
  agents: { faq },
  storage,
  // Traces go to the same store as the runs, so trace links survive restarts.
  observability: new Observability({ configs: { app: { serviceName: 'app', exporters: [new MastraStorageExporter()] } } }),
});

const dataset = await mastra.datasets.get({ id: 'course-faq' }).catch(() => null);
if (!dataset) console.log('Empty state: no dataset yet. Record a first run.'); // not "0%"

const { experiments } = await dataset.listExperiments();
const runs = experiments.filter((e) => e.status === 'completed').sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt));
const scores = await storage.getStore('scores');
const outcome = async (id) => {
  const { scores: s } = await scores.listScoresByRunId({ runId: id, pagination: { page: 0, perPage: 500 } });
  return new Map(s.filter((x) => x.scorerId === 'scenario-assertions').map((x) => [x.entityId, x.score === 1])); // entityId = item id
};

if (runs.length >= 2) {
  const [prev, latest] = [await outcome(runs.at(-2).id), await outcome(runs.at(-1).id)];
  const regressions = [...latest].filter(([item, ok]) => !ok && prev.get(item)); // passed before, fails now
  const { results } = await dataset.listExperimentResults({ experimentId: runs.at(-1).id });
  const obs = await storage.getStore('observability');
  for (const r of results.filter((r) => regressions.some(([i]) => i === r.itemId)))
    console.log(r.itemId, (await obs.getTrace({ traceId: r.traceId }))?.spans.length, 'spans'); // the trace link
} else console.log('Regressions need two runs.');
```
