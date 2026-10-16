## ADDED Requirements

### Requirement: Lab discovery
The API SHALL list registered labs and return a lab's `LabDefinition` by id, responding `NOT_FOUND` for unknown ids.

#### Scenario: Unknown lab
- **WHEN** a client requests `GET /api/labs/lab-98`
- **THEN** the response is 404 with code `NOT_FOUND`

### Requirement: Start a run
`POST /api/labs/:labId/runs` SHALL validate the body `{ input, mode, timeoutMs? }` against the lab's input schema, start the run asynchronously and respond 202 with `{ runId, correlationId, requestId }`.

#### Scenario: Invalid input
- **WHEN** the input violates the lab schema
- **THEN** the response is 422 `VALIDATION_FAILED` with per-field details and no run is started

#### Scenario: Live mode unavailable
- **WHEN** `mode` is `live` and the server is in offline mode or the lab is offline-only
- **THEN** the response is 503 `NOT_CONFIGURED` with an actionable message

#### Scenario: Concurrency limit
- **WHEN** the number of active runs equals the configured maximum
- **THEN** a new run is refused with 429 `TOO_MANY_REQUESTS` and `retryable: true`

### Requirement: Stream run events
`GET /api/runs/:runId/events` SHALL stream events as Server-Sent Events, replaying buffered events first (honouring `Last-Event-ID`), then live events, and SHALL end the stream after the `complete` event.

#### Scenario: Late subscriber
- **WHEN** a client subscribes after the run finished
- **THEN** it receives all buffered events ending with `complete`, then the stream closes

#### Scenario: Client disconnect
- **WHEN** the client closes the stream while the run is active
- **THEN** the server removes the subscriber and, if no subscriber reconnects within the grace period, aborts the run and releases its resources

### Requirement: Cancellation and deadlines
Runs SHALL be cancellable via `POST /api/runs/:runId/cancel` and SHALL be aborted when their deadline (`min(requested, lab maximum, server maximum)`) passes; lab code receives an `AbortSignal`.

#### Scenario: Cancel
- **WHEN** a client cancels an active run
- **THEN** the run emits an `error` event with code `CANCELLED` followed by `complete` with status `cancelled`

#### Scenario: Timeout
- **WHEN** a run exceeds its deadline
- **THEN** it emits `error` with code `TIMEOUT` and `complete` with status `timeout`, even if the lab ignores the signal

### Requirement: Error mapping and safe logging
Lab failures SHALL be mapped to canonical error codes; unknown errors become `INTERNAL` with a generic message, and any configured secret value is redacted from event payloads and logs.

#### Scenario: Secret in error message
- **WHEN** a lab throws an error whose message contains a configured API key
- **THEN** the emitted error event and server log contain only the masked key

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
