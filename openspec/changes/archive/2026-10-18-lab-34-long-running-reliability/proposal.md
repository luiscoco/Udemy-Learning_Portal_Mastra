# Proposal

## Why

Long-running jobs (a nightly billing run, a data migration) meet every kind of failure:

- a provider returns 503 for a moment;
- the worker process crashes halfway;
- the job is restarted while some operations already happened.

Mastra persists step results and workflow state, retries steps, and can restart an interrupted run from the last completed step. A restart still re-executes the step that was interrupted. So "no duplicate operations" also needs idempotency keys. Learners need to see each layer and prove the combination with a crash-recovery fixture.

## What Changes

- **New lab `lab-34`** (Module 07): a `billing-run` workflow, persisted with libSQL storage on a `Mastra` instance (`lab-34-workflows`).
  - **Steps:** `openBatch`, then one `charge-<invoiceId>` step per invoice, then `closeBatch`.
  - **State:** `stateSchema` holds `{ charged: [{ invoiceId, chargeId, attempts }], total }`. Each charge step updates it with `setState`.
  - **Retries:** `retryConfig: { attempts: 3, delay }` retries transient provider errors. Invoices can declare `failTimes`, the number of 503s before success.
  - **Charges:** they go through a simulated provider with a durable ledger (`lab-34-charges.jsonl`) and the idempotency key `charge:<batchRunId>:<invoiceId>`.
- **Crash and recovery in one lab run:**
  - **Crash point:** `crashAfter` names an invoice. After the provider records that invoice's charge, the worker "crashes": the step never returns, and its Mastra instance and storage client are discarded.
  - **Recovery:** a fresh instance finds the run still `running` in storage and calls `run.restart()` for that run id only. It then verifies that:
    - the earlier charge steps were not re-run;
    - the interrupted step re-ran and its charge was replayed by key, not repeated;
    - the state was recovered.
- **Real crash test.** A worker process calls `process.exit()` mid-step, and a second process restarts the run. The test asserts one charge per invoice.
- **Contrast `idempotency: none`:** the restarted step charges the crashed invoice a second time, and the check fails.

## Capabilities

### New Capabilities

- `course-labs/lab-34-long-running-reliability`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-34/`. No model is required for the reliability mechanics. One agent call in `closeBatch` writes the batch summary for the operator (live: one call per run).
