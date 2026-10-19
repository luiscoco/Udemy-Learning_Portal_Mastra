# Design

## Context

Verified in spikes with `@mastra/core` 1.78.0 and `@mastra/observability` 1.20.1:

- **Setup.** `new Mastra({ agents, workflows, observability: new Observability({ configs: { lab: { serviceName, exporters: [exporter] } } }) })`. An exporter extends `BaseExporter` and implements `_exportTracingEvent(event)`. Events are `{ type: 'span_started' | 'span_updated' | 'span_ended', exportedSpan }`.
- **Exported span fields:** `id`, `traceId`, `parentSpanId`, `name`, `type`, `entityType`, `entityId`, `entityName`, `attributes`, `metadata`, `startTime`/`endTime` (Date), `input`, `output`, `errorInfo`, `isEvent`, `isRootSpan`, `tags`.
- **Hierarchy observed** (scripted model, one tool call):
  - `workflow_run` (root) → `workflow_step` → `agent_run` → `model_generation` → `model_step`;
  - under each `model_step`: `model_inference` (with `model_chunk` children), `processor_run` spans, and `tool_call`.
  - With `.parallel([a, b])`, a `workflow_parallel` span is the parent of both step spans.
  - A step that calls `mastra.getAgent(id).generate()` gets the agent span as its child **without passing `tracingContext`** (the context propagates).
- **Unregistered agent:** an Agent that is not registered on the Mastra instance and is called inside a step produces **no spans at all**.
- **Tool errors:** a tool that throws ends its `tool_call` span with `errorInfo { message, name, stack }`. The stack contains absolute file paths, so it is stripped before export to the UI. The agent continues.
- **Correlation.** `run.start({ inputData, tracingOptions: { metadata, tags } })` puts the metadata on **every** span of the trace and the tags on the root only. The run result includes `traceId` and `spanId` (the root span).
- **Event spans.** One `model_chunk` (`tool-result`) is an event span (`isEvent: true`), which ends without a separate start event.
- **Flushing.** `Observability.flush()` / `shutdown()` exist on the registry. The lab calls `flush()` then `shutdown()` after the run instead of sleeping.

## Decisions

- **Collector** (`collector.ts`): `SpanCollector extends BaseExporter` keeps the events and an `onEnded` callback that logs `span ended: <type> <name> (<ms> ms)` for summary-view types. `analyse(events)` returns the started, ended and missing-end ids and the final span per id (the last event wins).
- **Flattening** (`tree.ts`):
  - `toTraceSpans(spans, rootStart)` maps each span to the contract with `startMs` and `durationMs` relative to the root start.
  - `status` is `error` when there is `errorInfo`, `open` without an end, and `ok` otherwise. `error` is the message only (≤ 300 chars).
  - Selected attributes: model, provider, `toolCallId`, `success`, `status`, usage tokens and finish reason.
  - `metadata.correlationId` becomes `correlationId`.
  - `viewOf(spans, 'summary' | 'full')`: the summary keeps `workflow_*`, `agent_run`, `model_generation`, `tool_call` and `mcp_tool_call`, and re-parents every kept span to its nearest kept ancestor.
- **Pipeline** (`pipeline.ts`):
  - `classify` is deterministic (topic keywords).
  - `.parallel([research, review])`: research uses the registered researcher (`search_sources`); review uses the registered reviewer, or under `detached-agent` a fresh unregistered Agent with the same instructions.
  - `answer` uses the writer.
  - Each step records `{ stepId, agentId, registered }` in an app-level call log (the ground truth for untraced work).
- **Coherence analysis** (`coherence.ts`):
  - **Parents:** parent exists in the trace; child window within parent window ± 5 ms; `workflow_step` parent ∈ {`workflow_run`, `workflow_parallel`}.
  - **Agents:** for each call-log entry, an `agent_run` with `entityId = agentId` whose parent is the step span of `stepId`.
  - **Tools:** `tool_call` → its nearest `model_step` ancestor → the agent run of the same agent entity.
  - **Untraced:** call-log entries without a matching `agent_run`.
- **Contract** `TraceTreeSchema` (`packages/contracts/src/trace-tree.ts`): `{ traceId, rootSpanId, correlation: { labRunId, correlationId, workflowRunId }, view, spans: TraceSpan[] (≤ 600), hiddenSpans, findings: string[] }`. The web `SpanTree` renders nested `<ul>` lists (`aria-label` "Trace spans"), each node with name, type badge, offset/duration, a timing bar sized relative to the root, an error badge and attribute chips.
