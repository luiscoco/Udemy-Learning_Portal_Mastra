# Proposal

## Why

Module 06 starts workflows: explicit, typed sequences of steps, unlike an agent that decides its own path. The first lab needs:

- a workflow with Zod input and output schemas and one typed step;
- a run that streams its lifecycle into the timeline;
- a result whose type is actually verified.

The installed Mastra validates workflow *input* at runtime but not step or workflow *output*, so learners must see where that guarantee ends.

## What Changes

- **Platform helper `shared/workflow-stream.ts`** (reused by L27–L35). `streamWorkflow(ctx, run, inputData)`:
  - maps `workflow-start`, `workflow-step-start`, `workflow-step-result` and `workflow-finish` chunks to lab `workflow-step` events, with the workflow id and measured durations;
  - returns the final result and the step trace.

  `runTypedWorkflow(...)` wraps it and validates the final result against the workflow's output schema, reporting `OUTPUT_INVALID` with the Zod issues.
- **New lab `lab-26`** (Module 06):
  - `quote-workflow` has `inputSchema` (order email, currency) and `outputSchema` (lines, subtotal, discount, total, formatted total).
  - One typed step, `extract-and-price`:
    1. an agent with `structuredOutput` turns the email into typed items;
    2. the step prices them from a mock catalog with an optional discount code.
  - A probe run with invalid input shows Mastra's input validation (`Invalid input data`).
  - A "buggy step" toggle returns the total as a string. Mastra still reports `success`, and the wrapper flags the output.

## Capabilities

### New Capabilities

- `course-labs/lab-26-first-typed-workflow`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/shared/workflow-stream.ts` and `packages/labs/src/lab-26/`. Offline is free. Live mode makes one structured-output model call.
