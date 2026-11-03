# lab-execution Specification

## Purpose
Starting, streaming, cancelling and validating lab runs through the API.

## Requirements

### Requirement: Lab discovery
The API SHALL list registered labs and return a lab's `LabDefinition` by id, responding `NOT_FOUND` for unknown ids.

#### Scenario: Unknown lab
- **WHEN** a client requests `GET /api/labs/lab-98`
- **THEN** the response is 404 with code `NOT_FOUND`

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

### Requirement: Stream run events
`GET /api/runs/:runId/events` SHALL stream events as Server-Sent Events, replaying buffered events first (honouring `Last-Event-ID`), then live events, and SHALL end the stream after the `complete` event.

#### Scenario: Late subscriber
- **WHEN** a client subscribes after the run finished
- **THEN** it receives all buffered events ending with `complete`, then the stream closes

#### Scenario: Client disconnect
- **WHEN** the client closes the stream while the run is active
- **THEN** the server removes the subscriber and, if no subscriber reconnects within the grace period, aborts the run and releases its resources

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

### Requirement: Error mapping and safe logging
Lab failures SHALL be mapped to canonical error codes; model provider HTTP errors SHALL map to NOT_CONFIGURED (401/403), TOO_MANY_REQUESTS (429) or PROVIDER_ERROR (other 4xx/5xx) with fixed messages that never copy the provider's text; other unknown errors become `INTERNAL` with a generic message, and any configured secret value is redacted from event payloads and logs.

#### Scenario: Secret in error message
- **WHEN** a lab throws an error whose message contains a configured API key
- **THEN** the emitted error event and server log contain only the masked key

#### Scenario: Provider rejects the API key
- **WHEN** a live model call fails with HTTP 401 from the provider
- **THEN** the run fails with NOT_CONFIGURED, a message telling the operator to check the server key, and no provider text

### Requirement: Source and preflight
The API SHALL serve the readonly reference source files declared by a lab (allowlisted, no path traversal) together with pinned dependency versions, and a preflight result listing environment checks.

#### Scenario: Traversal blocked
- **WHEN** a lab declares a source path containing `..`
- **THEN** registration fails

### Requirement: Dummy Lab 00
The registry SHALL contain Dummy Lab 00, a deterministic offline lab that emits log, token, tool and workflow-step events and a result checked by automated validation, at zero cost.

#### Scenario: Deterministic output
- **WHEN** Dummy Lab 00 runs twice with the same input
- **THEN** both runs produce identical result payloads and the validation passes

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
