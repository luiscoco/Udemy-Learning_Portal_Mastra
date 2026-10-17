## ADDED Requirements

### Requirement: Both branches complete and join
Lab 28 SHALL run the classify and summarize steps with `.parallel()`, then a merge step that receives both outputs.

#### Scenario: Example
- **WHEN** the example ticket runs
- **THEN** classify and summarize both succeed, merge runs once with both outputs, and the result is the merged triage record

### Requirement: Measured parallelism
Timing SHALL be derived only from Mastra's recorded step timestamps, and offline delays SHALL be labelled as simulated latency.

#### Scenario: Overlap
- **WHEN** the example runs with simulated latencies of 300 ms and 500 ms
- **THEN** the branch intervals overlap, the parallel span is below the sum of the branch durations, and the reported numbers equal the timestamps in the step records

### Requirement: Deterministic merge
The merged output SHALL NOT depend on which branch finishes first.

#### Scenario: Swapped latency
- **WHEN** the same ticket runs with the slower branch swapped
- **THEN** the completion order is reversed and the merged output is identical

### Requirement: Branch failure
A failing branch SHALL fail the workflow without losing the other branch's result.

#### Scenario: Summarize fails
- **WHEN** the summarize branch is set to fail
- **THEN** the workflow status is `failed`, classify is recorded as success, and merge does not run
