# Proposal

## Why

Independent work should not wait in line. Classifying a support ticket and summarizing it don't depend on each other, so a workflow can run them at the same time and join the results. Learners need to see:

- that the branches really run concurrently;
- that the join waits for both branches;
- that the merge is deterministic whichever branch finishes first;
- what happens when one branch fails.

The owner's prompt requires the speed-up to be shown "without invented timings".

## What Changes

- **New lab `lab-28`** (Module 06): a `triage-workflow` that runs `.parallel([classify, summarize]).then(merge)`.
  - **`classify`** uses an agent with structured output to produce `{ category, priority }`.
  - **`summarize`** uses an agent to write a one-sentence summary.
  - **`merge`** is a pure function that builds `{ ticketId, category, priority, summary, routedTo }` in a fixed field order from the joined input (keyed by step id).
- **Timing is measured, never invented.**
  - Each branch's interval comes from Mastra's recorded `startedAt` and `endedAt`.
  - From those, the run computes the overlap, the workflow wall time, the sum of the branch durations and the measured speed-up.
  - The branches' completion order comes from the stream.
  - Offline, branch latency is a learner input, labelled as **simulated latency** (a scripted delay). The numbers shown are still real measurements of that run.
- **Learner toggles:**
  - **slower branch** (`classify` or `summarize`): the completion order flips, and the merged output is identical;
  - **failing branch** (`none` or `summarize`): the workflow fails, `classify`'s success is still recorded, and `merge` never runs.

## Capabilities

### New Capabilities

- `course-labs/lab-28-parallel-branches`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-28/` and `shared/workflow-stream.ts` (which now exposes Mastra's per-step records). Offline is free. Live mode makes two model calls at the same time.
