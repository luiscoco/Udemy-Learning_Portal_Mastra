# lab-contracts Specification

## Purpose
Shared schemas describing labs, lesson content, execution events, validation, quiz and progress.

## Requirements

### Requirement: Lab definition contract
Every lab SHALL be described by a `LabDefinition` validated at registration time containing: id, title, module, summary, a plain-language concept of 5–10 sentences, 3–5 objectives, prerequisite lab ids, at least one input field, an example input, an expected output description, a lesson guide, a 3–5 question quiz, readable source file list, exercise instructions, automated check descriptions, an instructor outline of 3–7 minutes and execution limits.

#### Scenario: Incomplete lab rejected
- **WHEN** a lab definition has two hints or six quiz questions
- **THEN** registration fails with a validation error naming the field

#### Scenario: Example input is valid
- **WHEN** a lab is registered
- **THEN** its example input passes the lab's own input schema

### Requirement: Lesson guide
A `LessonGuide` SHALL contain an ordered procedure, a prediction prompt, exactly three progressive hints, at least one common mistake and a challenge; it MAY contain a diagram.

#### Scenario: Hints are ordered
- **WHEN** a guide is parsed
- **THEN** hints are returned as levels 1, 2 and 3 in that order

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

### Requirement: Validation, quiz and progress records
The contracts SHALL define `ValidationResult` (overall `passed` plus per-check id, label, passed, message), `QuizQuestion` (prompt, 2–6 choices, correct index, explanation) and `ProgressRecord` (lab id, status, flags for lesson read, successful run, checks passed, quiz score, notes, updated timestamp).

#### Scenario: Quiz correct index in range
- **WHEN** a quiz question's correct index is outside its choices
- **THEN** parsing fails

### Requirement: Canonical API errors
Every API error SHALL use the `ApiError` envelope with a canonical code, a human message free of secrets, an optional `retryable` flag, optional field-level `details` and the request id. The canonical codes SHALL include `FORBIDDEN` (HTTP 403) for requests that lack the credential an operation requires.

#### Scenario: Field details
- **WHEN** an execution request fails input validation
- **THEN** the error code is `VALIDATION_FAILED` and `details` lists each failing input path

#### Scenario: Forbidden
- **WHEN** a run is cancelled without its run token
- **THEN** the response is 403 with code `FORBIDDEN`

### Requirement: Conditional input visibility
Input fields and select options MAY declare `visibleWhen: { field, in }`, meaning they are shown only while the named earlier field's value is one of `in`. The lab definition contract SHALL reject a `visibleWhen` that references an unknown field, a later field or the field itself.

#### Scenario: Valid reference
- **WHEN** a definition declares `temperature` with `visibleWhen: { field: "modelId", in: ["openai/gpt-4o-mini"] }` after a `modelId` field
- **THEN** the definition parses

#### Scenario: Unknown field
- **WHEN** a field's `visibleWhen.field` names a field that does not exist
- **THEN** parsing fails with a message naming the missing field

### Requirement: Chat presentation contract
The lab definition contract SHALL allow an optional presentation of form or chat, and a chat transcript schema SHALL describe the thread, its threads and messages with a complete, stopped or failed status.

#### Scenario: Existing labs
- **WHEN** a lab definition omits presentation
- **THEN** it validates unchanged and renders as a form

### Requirement: Workflow graph event
The execution event contract SHALL include a workflow-graph event carrying a layered DAG of nodes and edges, so clients can draw a workflow before and while it runs.

#### Scenario: Existing clients
- **WHEN** a run never emits workflow-graph
- **THEN** every existing event and client behaves unchanged
