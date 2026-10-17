# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike, `@mastra/core/workflows`):

- **Building and running.** `createStep({ id, inputSchema, outputSchema, execute: async ({ inputData }) => … })` and `createWorkflow({ id, inputSchema, outputSchema }).then(step).commit()` work without a `Mastra` instance. `await (await wf.createRun()).start({ inputData })` returns `{ status: 'success', result, steps: { input, <stepId>: { status, output, startedAt, endedAt } }, stepExecutionPath, runId, traceId, spanId }`.
- **Input is validated.** Invalid input throws `MastraError` "Invalid input data:" with one line per field. `WorkflowOptions.validateInputs` exists, and its default validated in the spike.
- **Output is NOT validated.** A step that returns `{ line: 1 }` against an output schema `{ line: string, totalCents: number }` still finishes with `status: 'success'` and that result. There is no output-validation option in `WorkflowOptions`.
- **Streaming.** `run.stream({ inputData }).fullStream` emits:
  - `workflow-start { workflowId }`;
  - `workflow-step-start { stepName, id, stepCallId, payload }`;
  - `workflow-step-result { …, output, status }`;
  - `workflow-finish { workflowStatus, finalWorkflowResult }`.

  `stream.result` resolves to the same object as `start()`.

## Decisions

- **One typed step that does real work.** It extracts with an agent (structured output, as in L09) and prices deterministically. Typing matters at both boundaries: what the model returns, and what the workflow promises.
- **Output validation is app-level and explicit.** `runTypedWorkflow` validates `result` with the workflow's own `outputSchema` (`safeParse`), reports `outputValid` and the issues, and never returns an unvalidated result as typed. It is labelled in the source as an app-level wrapper, because Mastra 1.78 has no option for it.
- **The input-validation probe** runs a second `createRun().start()` with deliberately invalid input and records Mastra's error message. This costs no model call, because input validation precedes every step.
- **Streaming to events.** Chunks become `workflow-step` events with `workflowId`, `stepId`, `status` (`running` or `success`/`failed`), `input`, `output` and `durationMs`, so the existing Trace view shows the workflow without UI changes.

## Risks

- A future Mastra may add output validation. The lab then still works: the wrapper simply never finds an error. The compatibility doc records the 1.78 behaviour.
