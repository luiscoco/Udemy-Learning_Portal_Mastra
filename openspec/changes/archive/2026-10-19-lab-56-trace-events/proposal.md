# Proposal

## Why

Module 12 is about evaluation and observability. Its first lab makes Mastra's own execution visible: which workflow step called which agent, which model call ran which tool, how long each took, and where an error happened. A trace is only useful when its structure is trustworthy: every span has the right parent, all spans belong to one trace, and the correlation ids line up with the request that started it.

The DoD asks for Mastra execution instrumented with a supported tracing/observability adapter and shown as UI spans, with parent-child spans and correlations that remain coherent.

## What Changes

- **New dependency** `@mastra/observability` **1.20.1** (pinned exactly, server-only in `@mlp/labs`). It is the official adapter that provides the `Observability` class and the exporter base class. It was released with `@mastra/core` 1.78.0, and its peer range is `@mastra/core >=1.16.0-0 <2.0.0-0`.
- **New lab `lab-56`** (Module 12).
  - A per-run `Mastra` instance with `observability: new Observability({ configs: { lab: { serviceName, exporters: [collector] } } })`.
  - The collector is a `BaseExporter` subclass that keeps this run's `span_started`, `span_updated` and `span_ended` events and logs each ended span as it arrives.
  - The workflow `traced-pipeline` runs: `classify` (deterministic) → `.parallel([research, review])` → `answer`. Three registered agents take part: **researcher** (tool `search_sources`), **reviewer** and **writer**.
- **Correlation.** The run starts with `tracingOptions: { metadata: { correlationId, labRunId }, tags: ['lab-56'] }`. The trace id and root span id from the run result are compared with the spans.
- **UI spans.** A new contract `TraceTreeSchema` (`output.traceTree`) holds the flattened spans: id, parent, trace, type, entity, offset, duration, status, sanitised error and selected attributes. A new web component `SpanTree` renders it as a nested, accessible tree with type badges, durations, timing bars and errors.
  - A `summary` view keeps the workflow, step, agent, generation and tool spans, and re-parents the hidden spans' children to the nearest visible ancestor.
  - A `full` view shows every span.
- **Faults** (both modes):
  - `tool-error`: the first `search_sources` call throws, so the error must be attributed to that `tool_call` span.
  - `detached-agent`: the review step calls an agent that is not registered on Mastra, which produces no spans. The lab must detect the untraced work.
- **Checks:** `spans-complete`, `single-trace`, `parent-child-coherent`, `correlation-propagated`, `errors-attributed`, `untraced-work-detected`.

## Capabilities

### New Capabilities

- `course-labs/lab-56-trace-events`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/package.json` and the lockfile (new dependency), `packages/labs/src/lab-56/`, `packages/contracts/src/trace-tree.ts`, `apps/web/src/components/workspace/SpanTree.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, registry, COMPATIBILITY rows (dependency and tracing behaviour).
- **Modes:** offline (scripted models; real Mastra spans) and live (three agent runs).
