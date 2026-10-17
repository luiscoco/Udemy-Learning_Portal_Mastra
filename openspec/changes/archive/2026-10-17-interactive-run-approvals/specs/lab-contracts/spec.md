## MODIFIED Requirements

### Requirement: Execution event contract
Execution events SHALL be a discriminated union on `type` with values `log`, `token`, `tool-start`, `tool-finish`, `workflow-step`, `approval-request`, `approval-resolved`, `result`, `error`, `complete`, each carrying `runId`, `correlationId`, a monotonically increasing `seq`, an ISO `timestamp` and optional `annotations`.

#### Scenario: Unknown event type
- **WHEN** an event with `type: "debug"` is parsed
- **THEN** parsing fails

#### Scenario: Terminal event
- **WHEN** a run ends for any reason
- **THEN** exactly one `complete` event is the last event, with status `succeeded`, `failed`, `cancelled` or `timeout`

#### Scenario: Approval events
- **WHEN** an `approval-request` event is parsed
- **THEN** it carries `approvalId`, `toolName`, `args`, `message` and an ISO `expiresAt`, and the matching `approval-resolved` carries `approvalId`, `decision` (`approve` or `decline`) and `by` (`user` or `timeout`)
