# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike):

- **Chaining.** `.then(a).then(b)` passes `a`'s output as `b`'s input. The result's `stepExecutionPath` is `['a', 'b']`.
- **Transitions are validated at runtime.** When a step's output breaks the next step's `inputSchema`, the run ends with `status: 'failed'` and error code `WORKFLOW_STEP_INPUT_VALIDATION_FAILED` ("Step input validation failed: - words: …"). The step results are `{ a: success, b: failed }`.

  This differs from the *final* output, which is not validated (L26).
- **Mapping.** `.map(async ({ inputData }) => …)` adds a mapping step named `mapping_<workflowId>_<n>` to `steps` and `stepExecutionPath`.
- **Earlier data.** `execute` receives `getStepResult(step)` and `getInitData()`, for reading earlier step outputs and the workflow input.

## Decisions

- **Schemas live in one module** (`steps.ts`) and are exported, so the checks re-validate every recorded transition against the real next-step schema. The trace and the checks share one source of truth.
- **Deterministic enrichment.**
  - The reference date (`today`) is an input, so "days until" is reproducible.
  - Time zones come from a small city table.
  - UTC conversion uses `Intl.DateTimeFormat` `formatToParts` for the IANA zone, without a date library.
- **The `.ics` output** uses only fields from the typed render input (DTSTART in UTC, SUMMARY, LOCATION, ORGANIZER as CN). It is plain text and is never executed.
- **The broken-enrich toggle** (`daysUntil` as text) demonstrates the runtime guard. A mapping step has no input schema and passes bad data through, so the guard fires at the next schema'd step (`render`). The lab reports the failed transition with Mastra's error code, and the checks expect `render` not to run.
- **Trace order** is derived from stream events. The expected order includes the mapping step id.

## Risks

- **The mapping step id format** (`mapping_<id>_<n>`) is an internal naming convention. The lab reads it from `stepExecutionPath` instead of hard-coding it in the checks.
