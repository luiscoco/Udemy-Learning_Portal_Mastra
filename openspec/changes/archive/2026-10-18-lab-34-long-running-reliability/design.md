# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 with libSQL storage. The spikes covered both a real `process.exit()` in a second process and an in-process abandonment.

- **Snapshots at step boundaries.** After a crash inside step 3 of 4, the snapshot is `running`, with steps 1 and 2 `success` and step 3 `running`.
- **Workflow state survives the crash.** `stateSchema` + `setState` state is persisted: `{ done: [s1, s2] }` was in the snapshot. `listActiveWorkflowRuns()` finds the run.
- **`createRun({ runId }).restart()` from a new instance or process** continues the run:
  - completed steps do **not** run again;
  - **the interrupted step runs again from its start**, with the state as of its start;
  - the following steps then run.

  A side effect performed in the interrupted step before the crash is therefore repeated unless it is idempotent.
- **Restarting a completed run** returns `success` and executes nothing.
- **Retry config.** `createWorkflow({ retryConfig: { attempts: 3, delay: 150 } })` retries failing steps with the delay; gaps of 150 ms were measured. Step-level `retries` overrides the attempt count (L33).
- **No streaming restart.** `restartStream` does not exist; `restart()` returns the final result.

## Decisions

- **Checkpoint granularity.** There is one step per invoice, so a restart re-runs at most one charge. The workflow is rebuilt from the same input for the recovering instance, giving the same step graph.
- **The crash simulation is in-process.** It runs in the API, which must not exit:
  - the step resolves a `crashed` signal and then awaits a promise that never settles, so the abandoned run makes no further writes;
  - the lab discards that `Mastra` instance and closes its storage client;
  - the timeline marks the run as crashed.

  The real-exit variant is the integration test.
- **Restart only the lab's own run id**, never `restartAllActiveWorkflowRuns()`. Another learner's run that is genuinely in progress would otherwise be run twice. The lab notes that production needs a lease or heartbeat to tell crashed runs from live ones. That is a challenge, not built here.
- **Provider simulator** (app-level):
  - `charge({ key, batch, invoiceId, amount, attempt })` first fails `failTimes` times with `503 service unavailable`, before recording anything, so Mastra retries;
  - it then records the charge;
  - a known key replays the earlier charge.
- **Execution log** (in memory, per lab run). It records step entries with the instance (`A` before the crash, `B` after the restart) and the state seen at entry. The timeline events for the restart are emitted from this log, because there is no restart stream.
- **Checks:**
  - `crash-detected`: a fresh instance sees the run `running`, with the steps before the crash point completed;
  - `resumed-after-crash`: the restart succeeded, no charge step that completed before the crash ran again, and the crashed step plus the rest ran on instance B;
  - `no-duplicate-charges`: exactly one charge per invoice in the ledger;
  - `transient-recovered`: every invoice with `failTimes > 0` succeeded after more attempts;
  - `state-persisted`: the crashed step saw the pre-crash state on re-entry, and the final state covers every invoice and the total.
- **Bounds.** 1–6 invoices, `failTimes` 0–2 (within 3 attempts), `crashAfter` either an invoice id or `none`.

## Risks

- **The abandoned run is never collected.** It stays pending inside the API process until GC. It holds no timers and no storage handle, and a run deadline bounds the lab run.
