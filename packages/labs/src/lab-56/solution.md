# Solution: trace a workflow with your own exporter

```ts
import { Mastra } from '@mastra/core';
import type { TracingEvent } from '@mastra/core/observability';
import { BaseExporter, Observability } from '@mastra/observability';

class MemoryExporter extends BaseExporter {
  name = 'memory';
  events: TracingEvent[] = [];
  protected async _exportTracingEvent(e: TracingEvent) {
    this.events.push(e); // span_started | span_updated | span_ended
  }
}

const exporter = new MemoryExporter();
const observability = new Observability({ configs: { app: { serviceName: 'my-app', exporters: [exporter] } } });
const mastra = new Mastra({ agents: { researcher, writer }, workflows: { pipeline }, observability });

const run = await mastra.getWorkflow('pipeline').createRun();
const result = await run.start({
  inputData: { question },
  tracingOptions: { metadata: { correlationId: 'req-123' }, tags: ['docs'] }, // copied onto every span
});
await observability.flush(); // no sleeping

const spans = exporter.events.filter((e) => e.type === 'span_ended').map((e) => e.exportedSpan);
const byId = new Map(spans.map((s) => [s.id, s]));
for (const s of spans) {
  const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
  console.log(s.type, s.name, '←', parent?.name ?? '(root)', s.traceId === result.traceId);
}
// Inside steps, call mastra.getAgent('researcher'): an unregistered Agent leaves no spans.
await observability.shutdown();
```
