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

### Requirement: Durable recorded executions
Configured persistent execution storage SHALL retain owner-bound snapshots and ordered redacted events across API restarts, within documented retention limits. A run's initial record MUST commit before lab execution starts; normal events MUST commit before being streamed. Storage or integrity failures SHALL fail closed. Persistent mode SHALL refuse concurrent active runners on the same journal.

#### Scenario: Completed execution after restart
- **WHEN** the owning learner fetches a retained completed run after an API restart
- **THEN** its snapshot and ordered SSE events, ending in complete, are available without executing the lab again

#### Scenario: Initial journal write fails
- **WHEN** persistent storage cannot record a new run
- **THEN** the request fails and the lab's code is not started

#### Scenario: Another runner owns the journal
- **WHEN** another API process attempts to use a journal that already has an active runner
- **THEN** startup is refused without changing live run records

### Requirement: Safe interruption recovery
After a persistent runner restarts, executions recorded as running SHALL become failed with an explicit interruption error and zero actionable approvals. Their code MUST NOT resume or rerun automatically, and no human decision SHALL be fabricated. A stale approval decision SHALL return conflict. Existing explicitly persisted workflow snapshots remain independent of HTTP execution recovery.

#### Scenario: Process exits during approval
- **WHEN** the API exits while a run waits for approval and then restarts
- **THEN** the recorded run is failed, the interruption is replayed, and a late approval cannot trigger its former continuation

### Requirement: Owner execution and capability recovery
Authenticated owners SHALL list a bounded set of their recent runs and obtain a new bounded mutation capability for a known run. Other learners SHALL receive 404 for that run and anonymous callers 401. Recovery capabilities MUST NOT appear in snapshots, events or logs, and persistent storage SHALL retain only their hashes. The original start capability SHALL remain valid while retained.

#### Scenario: Recover after losing the tab capability
- **WHEN** the owner recovers a live run using their verified session
- **THEN** the response provides its snapshot and a new capability usable for cancellation and pending approvals

#### Scenario: Another learner requests recovery
- **WHEN** learner B requests learner A's run recovery
- **THEN** the response is 404 and no capability is issued

#### Scenario: Recent run discovery
- **WHEN** a learner requests recent runs for a lab
- **THEN** the response contains only their bounded retained snapshots and no capability values

### Requirement: Bounded run request admission
The API SHALL enforce configured per-learner and per-client-network limits for run starts and, separately, approval decisions plus capability recovery. Refused requests SHALL return retryable TOO_MANY_REQUESTS with HTTP 429, Retry-After and an accessible wait message, before executing the requested action. Rejection SHALL NOT extend the wait or consume an otherwise available allowance.

#### Scenario: Learner exceeds run allowance
- **WHEN** an authenticated learner exceeds the start allowance across labs or sessions
- **THEN** no new run starts, the response is 429 with retry guidance, and admission becomes available after the indicated window

#### Scenario: Shared client network exceeds allowance
- **WHEN** multiple learners exhaust their shared client network's allowance
- **THEN** further requests in that family are refused even if the individual learner has remaining allowance

#### Scenario: Control allowance is exhausted
- **WHEN** a learner exhausts the shared approval/recovery allowance
- **THEN** a further approval or recovery is refused without settling the pending approval or issuing another capability

### Requirement: Safe bounded request accounting
Request accounting SHALL preserve existing authentication and ownership checks, derive identities from verified sessions and the configured proxy trust boundary, group IPv6 clients by /64, and bound retained state without evicting active allowances. Cancellation, reads and event replay SHALL remain available independently of these request limits. Expired state SHALL be reclaimed; full active accounting capacity SHALL fail closed with retry guidance.

#### Scenario: Cancellation while throttled
- **WHEN** the owner cancels a live run with its valid capability after exhausting request allowances
- **THEN** cancellation succeeds and its terminal events remain readable

#### Scenario: Wrong owner or anonymous caller
- **WHEN** a non-owner or anonymous caller requests a protected run action
- **THEN** existing 404 or 401 behavior is preserved and no victim's learner allowance is consumed

#### Scenario: Forwarding header without a trusted proxy
- **WHEN** a direct client changes X-Forwarded-For while proxy trust is disabled
- **THEN** those requests share the socket client's allowance

#### Scenario: Accounting capacity is full
- **WHEN** all retained accounting entries are active and a request needs another entry
- **THEN** the request is refused with retry guidance without erasing any existing allowance
