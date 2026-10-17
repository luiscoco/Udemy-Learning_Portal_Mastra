# Proposal

## Why

Real workflows reuse building blocks: the same customer verification runs inside an order workflow, a refund workflow, or on its own. Mastra lets a committed workflow be used as a step. Learners need to see three things:

- how a subworkflow's steps appear in the trace;
- that the subworkflow's schemas form a boundary;
- where that boundary is enforced by Mastra and where it has to be enforced by the app.

## What Changes

- **New lab `lab-31`** (Module 07): a reusable `verify-customer` workflow nested inside an `order-workflow`.
  - **`verify-customer`** runs `checkIdentity → screenRisk → decide`:
    - `checkIdentity` is deterministic: email format and a disposable-domain list;
    - `screenRisk` uses an agent with structured output, giving a `low`, `medium` or `high` risk level and reasons;
    - `decide` is pure.
  - **`order-workflow`** runs `prepareOrder → verify-customer → fulfil`:
    - `prepareOrder` computes the total and maps the order to the minimal `VerificationInput { email, country, total, notes }`;
    - `fulfil` confirms or holds the order.
- **Boundary checks.**
  - **Input boundary.** The keys the subworkflow actually received, from the stream, must equal `VerificationInput`'s keys. Line items, address and card digits never cross the boundary.
  - **Output boundary.** Mastra does not validate it, so the app validates the subworkflow's output against `VerificationResult`.
- **Trace.** Nested steps appear as `verify-customer.<step>` events.
- **Reuse.** The same `verify-customer` instance also runs standalone on the same input. Its result must equal the nested one. Risk screenings are cached per run, so the standalone run makes no extra model call.
- **Contrast toggle `boundaryFault`:**
  - `none`;
  - `whole-order`: `prepareOrder` returns the whole order, and the strict schema strips the extras, so the check still passes;
  - `loose-schema`: the subworkflow uses `z.looseObject`, extras leak and the check fails;
  - `bad-output`: `decide` returns a malformed result, which Mastra lets through until `fulfil`'s input validation fails, and the lab attributes the failure to the subworkflow output.
- **Shared helper.** `streamWorkflow` keeps each step's start payload in its trace (additive).

## Capabilities

### New Capabilities

- `course-labs/lab-31-nested-workflows`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-31/` and `packages/labs/src/shared/workflow-stream.ts` (additive). Offline is free. Live mode makes one model call per order that passes the identity check.
