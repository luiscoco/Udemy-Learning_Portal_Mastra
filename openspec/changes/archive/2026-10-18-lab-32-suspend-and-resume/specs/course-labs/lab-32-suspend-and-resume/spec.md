## ADDED Requirements

### Requirement: Persisted suspension checkpoint
Lab 32 SHALL suspend a workflow at a documents checkpoint using Mastra `suspend()` with libSQL-backed snapshots.

#### Scenario: Start suspends
- **WHEN** the workflow starts for an applicant
- **THEN** it ends with status `suspended` at `awaitDocuments`, with a suspend payload listing the required documents, and a fresh Mastra instance reads the snapshot back as `suspended`

### Requirement: Resume continues from the checkpoint
Resuming SHALL continue from the persisted checkpoint without re-running earlier side effects.

#### Scenario: Resume after restart
- **WHEN** the run is resumed with the required documents, from a new instance or a new process
- **THEN** only `awaitDocuments` and `activate` run, the ledger shows `createAccount`, `chargeFee` and `draftRequest` exactly once each, and the account is activated

#### Scenario: Duplicate resume
- **WHEN** a completed run is resumed again
- **THEN** the resume is rejected as `NOT_SUSPENDED` and no side effect is recorded

#### Scenario: Faked resume by rerunning
- **WHEN** `checkpointStyle` is `rerun`
- **THEN** the pre-checkpoint side effects appear twice in the ledger and the no-duplicate check fails

### Requirement: Inspect and resume by id
The lab SHALL let learners start, inspect and resume a run by its workflow run id across separate lab runs.

#### Scenario: Unknown run id
- **WHEN** `inspect` or `resume` is called with a run id that has no snapshot
- **THEN** the lab reports `UNKNOWN_RUN` without throwing
