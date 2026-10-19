## ADDED Requirements

### Requirement: Deterministic multi-agent workflow with typed boundaries
Lab 54 SHALL orchestrate an extractor, a diagnostician and a communicator agent through a fixed sequence of typed workflow steps, SHALL validate every agent result against its schema before passing it on, and SHALL produce the same step trace when the same input runs repeatedly.

#### Scenario: Complete run
- **WHEN** the example runs offline twice with no fault
- **THEN** all three agents run once per run in the order extract, fetch-logs, diagnose, communicate, assemble, the status is `complete`, and both runs have the same trace signature

### Requirement: Retries and error boundaries
Agent steps SHALL retry failures with backoff up to `stepRetries` times and SHALL contain a final failure in a typed result instead of failing the workflow.

#### Scenario: Transient failure
- **WHEN** the fault is `transient-diagnosis` and `stepRetries` is 2
- **THEN** the diagnose step fails twice, succeeds on its third attempt, and the status is `complete`

#### Scenario: Permanent failure
- **WHEN** the fault is `permanent-diagnosis`
- **THEN** the diagnose step exhausts its retries, the status is `degraded`, the update says the cause is under investigation, and the workflow itself succeeds

#### Scenario: Critical failure
- **WHEN** the fault is `extract-down`
- **THEN** the diagnostician and the communicator do not run, no update is published, and the status is `failed-safe`
