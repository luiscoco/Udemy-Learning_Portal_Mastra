# Proposal

## Why

Some actions must not happen without a person's decision. A refund is the classic case. The approval has to survive restarts, may never arrive, and must lead to exactly one refund when it is given, even when the payment provider times out and the step is retried. Learners need a durable approval gate with three properties:

- reject and timeout never pay;
- a late or duplicate approval changes nothing;
- the approved path is idempotent.

## What Changes

- **New lab `lab-33`** (Module 07): a `refund-approval` workflow, persisted with libSQL storage on a `Mastra` instance like L32, stored in `lab-33-workflows`. Its steps:
  1. **`prepareRefund`**: an agent writes a short summary and recommendation for the supervisor.
  2. **`supervisorApproval`**: suspends with `{ refundId, amount, summary, recommendation, expiresAt }`. The resume data is `{ decision: approve | reject | expire, supervisor, note? }`. A decision after `expiresAt`, or an `expire` from the sweep, ends as `expired`.
  3. **`settle`** (Mastra `retries: 2`): pays only when approved, through a simulated payment provider. The provider records the refund and can then lose the acknowledgement (`ackFailures`), which forces a retry. The idempotency key `refund:<workflowRunId>` makes the retry replay the same payment instead of paying twice.
- **Actions:**
  - `demo` (default) runs several refund requests, each with a supervisor decision of `approve`, `reject`, `none` (never answered) or `ask` (the learner decides in the Run tab through the existing approval prompt):
    1. start all requests; each suspends with no payment;
    2. in-process restart, then list the suspended runs from storage;
    3. apply the decisions;
    4. send a duplicate approval, which must be rejected;
    5. run an expiry sweep on a simulated clock past the time limit; undecided runs become `expired`;
    6. send a late approval of an expired request, which must be rejected and pay nothing.
  - `start`, `decide` (by workflow run id) and `sweep` (real clock) support a real restart between steps.
- **Contrast `idempotency: none`:** the retry after a lost acknowledgement pays a second time, and the check fails.
- **Release gates.** Durable approvals are now provided by the workflow pattern. The in-run approval prompt (L15 tool approvals) stays in memory, and the gate text is updated to say so precisely.

## Capabilities

### New Capabilities

- `course-labs/lab-33-human-approval`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-33/` and `docs/RELEASE-GATES.md`. Offline is free. Live mode makes one model call per started request; decisions, sweeps and settlement make none.
