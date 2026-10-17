## ADDED Requirements

### Requirement: Human approval during a run
Lab code SHALL be able to pause a run with `ctx.requestApproval()`; the run SHALL emit `approval-request` and resume when `POST /api/runs/:runId/approvals/:approvalId` records a decision, emitting `approval-resolved`.

#### Scenario: Approve while running
- **WHEN** a run is waiting for approval and the client posts `{ "decision": "approve" }`
- **THEN** the response is 200, an `approval-resolved` event with `by: "user"` is emitted and the lab continues with the decision

#### Scenario: Duplicate or late decision
- **WHEN** a decision is posted for an approval that is already resolved, or for a finished run
- **THEN** the response is 409 `CONFLICT` and the run is unaffected

#### Scenario: Unknown run
- **WHEN** a decision is posted for an unknown run id
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: Invalid body
- **WHEN** the decision is not `approve` or `decline`
- **THEN** the response is 422 `VALIDATION_FAILED`

#### Scenario: Approval timeout
- **WHEN** nobody decides within the approval timeout
- **THEN** the approval resolves as `decline` with `by: "timeout"`

## MODIFIED Requirements

### Requirement: Cancellation and deadlines
Runs SHALL be cancellable via `POST /api/runs/:runId/cancel` and SHALL be aborted when their deadline (`min(requested, lab maximum, server maximum)`) passes; lab code receives an `AbortSignal`. Time spent waiting for a human approval SHALL NOT count against the deadline.

#### Scenario: Cancel
- **WHEN** a client cancels an active run
- **THEN** the run emits an `error` event with code `CANCELLED` followed by `complete` with status `cancelled`

#### Scenario: Timeout
- **WHEN** a run exceeds its deadline
- **THEN** it emits `error` with code `TIMEOUT` and `complete` with status `timeout`, even if the lab ignores the signal

#### Scenario: Deadline paused while waiting
- **WHEN** a run with a 300 ms deadline waits 600 ms for approval and is then approved
- **THEN** it completes with status `succeeded`

#### Scenario: Cancel while waiting
- **WHEN** a run waiting for approval is cancelled
- **THEN** it ends with status `cancelled`
