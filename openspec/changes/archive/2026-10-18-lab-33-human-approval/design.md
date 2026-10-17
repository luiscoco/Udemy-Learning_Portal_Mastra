# Design

## Context

Verified against the installed `@mastra/core` 1.78.0. Suspend, resume and persistence behave as recorded in L32. In addition:

- **Retries.** `createStep({ retries: 2 })` retries a throwing step up to twice (three attempts in total). The step receives `retryCount` (0, 1, 2), and the stream shows one start and one result for the whole series. When the retries are exhausted, the step and the workflow fail.
- **Listing.** `workflow.listWorkflowRuns({ status: 'suspended' })` on a fresh instance returns `{ runs, total }`. Each run has a `snapshot` whose `context[stepId].suspendPayload` holds the payload. That is enough for an expiry sweep.

## Decisions

- **Gate placement.** The payment happens only in `settle`, after `supervisorApproval`. Steps before the gate have no money side effects; the model draft is the only cost.
- **Expiry rule.** It lives in the workflow, not in the caller:
  - `supervisorApproval` compares `deps.now()` with `expiresAt` from its own suspend payload (`suspendData`) on every resume;
  - an approval after the deadline becomes `expired`;
  - the sweep resumes overdue runs with `decision: 'expire'`.
  - The demo uses a simulated clock (`now` = start + ttl + 1 minute for the sweep), labelled in the log. The real actions use the system clock.
- **Payment provider simulator** (app-level), ledger file `lab-33-payments.jsonl`:
  - `refund({ key?, lineage, refundId, amount })` replays the existing payment when `key` was already used;
  - otherwise it writes a new payment;
  - it then throws `connection reset before acknowledgement` while lost acknowledgements remain for that refund (`ackFailures`, per lab run, in memory).
  - The key is `refund:<workflowRunId>`, unique per approval request, so separate learner runs never collide.
- **Duplicate and late decisions** are rejected by Mastra (`This workflow run was not suspended`) once the run has completed. The lab reports them as typed outcomes and verifies the payment count did not change.
- **Interactive `ask`.** `ctx.requestApproval({ toolName: 'approve-refund', args, message })`:
  - approve becomes `approve`;
  - decline becomes `reject`;
  - timeout or limit becomes no decision, so the sweep later expires the request.

  If the API restarts while waiting, the refund stays suspended in storage. `decide` or `sweep` handles it later.
- **Checks:**
  - `approval-gated`: suspended, with zero payments before any decision;
  - `survives-restart`: listed as suspended by a fresh instance;
  - `approved-refunded-once`: exactly one payment per approved request, even after lost acknowledgements;
  - `no-refund-on-reject-or-expiry`;
  - `expiry-enforced`: undecided requests expired, and a late approval was rejected without payment;
  - `duplicate-approval-rejected`.
- **Bounds.** 1–4 requests, amounts from 0.01 to 5,000, ttl 1–1,440 minutes, `ackFailures` 0–2 (at most the retry budget).

## Risks

- **Retry budget.** With `idempotency: none` and `ackFailures: 2`, three payments are made. This is intended for the contrast and bounded by `retries: 2`.
