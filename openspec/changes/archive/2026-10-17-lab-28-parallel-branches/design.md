# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike):

- **Branches really run concurrently.** In `.parallel([a, b]).then(merge)` with steps of 200 ms and 300 ms, both started at about 7 ms, and the workflow took 327 ms, close to the slower branch rather than the 500 ms sum.
- **The join is keyed by step id.** The next step's input is `{ <aId>: aOutput, <bId>: bOutput }`.
- **Each step record** holds `status`, `output`, `startedAt` and `endedAt` in epoch ms.
- **`stepExecutionPath` lists only `["merge"]`.** The parallel branches are not in the path, but they are in `steps`.
- **Stream order:** step-start for both branches, then the step-results in completion order, then the merge.
- **One failing branch** gives `status: failed` with the branch error. The other branch's success is still recorded, and `merge` does not run.

## Decisions

- **Measured timing only.**
  - Branch intervals come from Mastra's step records, which `streamWorkflow` now returns as `stepRecords`.
  - Wall time is `merge.endedAt − min(branch.startedAt)`.
  - Speed-up is `sum(branch durations) / parallel span`.
  - Nothing is estimated or hard-coded.
  - Offline delays are scripted. They are labelled "simulated latency" in the inputs, the result and the effective options, so a fast offline number is never presented as model speed.
- **A deterministic merge.** `mergeTriage(joined)` is pure, with fixed key order and routing from a table (category → queue). A check recomputes it from the recorded branch outputs, and a fixture with the opposite latency order asserts byte-identical merged output.
- **Completion order is reported, not relied on.** It comes from the order of `workflow-step-result` events. It is shown so learners see it change, while the merge does not.
- **Parallel-safety of the agents.** There is one agent per branch, with no shared mutable state. Offline, each branch has its own scripted model instance.

## Risks

- **Live branch timings vary.** The `ran-in-parallel` check needs overlapping intervals, which concurrent provider calls produce. The speed-up check only requires that the span is below the sum.
