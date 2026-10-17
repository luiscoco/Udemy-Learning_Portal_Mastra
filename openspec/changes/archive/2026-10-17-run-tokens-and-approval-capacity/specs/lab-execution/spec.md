## MODIFIED Requirements

### Requirement: Start a run
`POST /api/labs/:labId/runs` SHALL validate the body `{ input, mode, timeoutMs? }` against the lab's input schema, start the run asynchronously and respond 202 with `{ runId, correlationId, requestId, runToken }`, where `runToken` is a random secret that SHALL NOT appear in snapshots, events or logs. Runs waiting for a human approval SHALL NOT count towards the concurrency limit.

#### Scenario: Invalid input
- **WHEN** the input violates the lab schema
- **THEN** the response is 422 `VALIDATION_FAILED` with per-field details and no run is started

#### Scenario: Live mode unavailable
- **WHEN** `mode` is `live` and the server is in offline mode or the lab is offline-only
- **THEN** the response is 503 `NOT_CONFIGURED` with an actionable message

#### Scenario: Concurrency limit
- **WHEN** the number of active runs equals the configured maximum
- **THEN** a new run is refused with 429 `TOO_MANY_REQUESTS` and `retryable: true`

#### Scenario: Waiting runs free their slot
- **WHEN** the concurrency limit is 1 and the only active run is waiting for approval
- **THEN** a new run can start

#### Scenario: Token kept private
- **WHEN** a run snapshot or its events are fetched
- **THEN** they do not contain the run token

### Requirement: Human approval during a run
Lab code SHALL be able to pause a run with `ctx.requestApproval()`; the run SHALL emit `approval-request` and resume when `POST /api/runs/:runId/approvals/:approvalId` with a valid `X-Run-Token` header records a decision, emitting `approval-resolved`. At most `MAX_PENDING_APPROVALS` runs SHALL wait at once.

#### Scenario: Approve while running
- **WHEN** a run is waiting for approval and the client posts `{ "decision": "approve" }` with the run token
- **THEN** the response is 200, an `approval-resolved` event with `by: "user"` is emitted and the lab continues with the decision

#### Scenario: Missing or wrong token
- **WHEN** a decision or a cancel is posted without the run token or with a different one
- **THEN** the response is 403 `FORBIDDEN` and the run is unaffected

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

#### Scenario: Approval capacity reached
- **WHEN** `MAX_PENDING_APPROVALS` runs are already waiting and another run requests approval
- **THEN** that request resolves immediately as `decline` with `by: "limit"`
