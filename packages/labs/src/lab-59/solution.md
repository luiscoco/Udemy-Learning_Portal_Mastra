# Solution: compare configurations honestly

```ts
// One experiment per configuration, all on the same dataset version.
const runs = [];
for (const cfg of ['cfg-grounded', 'cfg-concise']) {
  const s = await dataset.startExperiment({ version, targetType: 'agent', targetId: cfg, scorers, name: `config:${cfg}` });
  runs.push({ cfg, experimentId: s.experimentId });
}

// Per-scenario scores from storage; aggregates are yours to compute.
const cmp = await mastra.datasets.compareExperiments({ experimentIds: runs.map((r) => r.experimentId), baselineId: runs[0].experimentId });

for (const r of runs) {
  const { results } = await dataset.listExperimentResults({ experimentId: r.experimentId });
  const passRate = cmp.items.filter((i) => i.results[r.experimentId]?.scores['scenario-assertions'] === 1).length / cmp.items.length;
  const tokens = results.reduce((n, x) => n + (x.output?.usage?.totalTokens ?? 0), 0); // say whether simulated or real
  const latencies = results.map((x) => new Date(x.completedAt) - new Date(x.startedAt)).sort((a, b) => a - b);
  const p95 = latencies[Math.ceil(0.95 * latencies.length) - 1];
  // Cost: only what the provider reported. Results carry none, and estimatedCost is a price-table estimate.
  const reported = results.map((x) => x.output?.usage?.cost).filter((c) => typeof c === 'number');
  const cost = reported.length === results.length ? reported.reduce((a, b) => a + b, 0) : null; // null = not reported
  console.log(r.cfg, { passRate, tokens, p95, cost });
}
// Export a CSV with the experiment ids and a JSON document with the metric definitions.
```
