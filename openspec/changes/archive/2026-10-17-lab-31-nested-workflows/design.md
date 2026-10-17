# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike, a committed workflow passed to `.then()`):

- **Nested trace.** Nested steps stream as `workflow-step-start` / `workflow-step-result` with the ids `<subworkflowId>.<stepId>`, between the start and the result of the subworkflow step itself.
- **Parent step records** list only the subworkflow as one step (`verify`). `stepExecutionPath` is `['prep', 'verify', 'fin']`.
- **Input boundary.** The subworkflow's input is validated (`WORKFLOW_STEP_INPUT_VALIDATION_FAILED`), and **undeclared keys are stripped**. A parent step returning `{ email, card }` gave the subworkflow `{ email }`.
- **Output boundary.** The subworkflow's output is **not** validated. A malformed `{ verified: 'yes' }` was recorded as `success`. The failure surfaced only at the next step's input validation.
- **Reuse.** One workflow instance can be nested in two parents and run standalone, concurrently, with isolated results.

## Decisions

- **Data minimisation through the input schema.** `prepareOrder` maps explicitly. The lab checks the received keys from the stream payload (the data actually sent), not from the declaration.
- **App-level output validation.** The subworkflow output from the parent's step record is parsed with `VerificationResultSchema`. A violation is reported as a boundary failure of `verify-customer`, not as an error at `fulfil`.
- **Reuse check.** For each order, `verify-customer.createRun()` runs standalone with the same `VerificationInput`. The risk screener is memoised per lab run, keyed by the input, so live mode stays deterministic and costs no extra call. The run log says when a screening was reused.
- **Batch.** 1–4 orders, each with `expectDecision`. The example has a clean order (approved), an order with a disposable email (held at the identity check, no model call) and an order with high-risk notes (held).
- **Privacy in the trace.** Orders carry only `cardLast4`, so start payloads shown in the timeline expose nothing sensitive.

## Risks

- **Live risk ratings may vary.** The example's high-risk notes are unambiguous. A mismatch is reported per order.
