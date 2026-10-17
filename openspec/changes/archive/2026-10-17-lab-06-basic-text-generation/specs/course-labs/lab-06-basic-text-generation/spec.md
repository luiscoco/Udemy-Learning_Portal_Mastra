## ADDED Requirements

### Requirement: Generate and display text
Lab 06 SHALL call `agent.generate` with the learner's prompt and return the answer text with request metadata (request id, correlation id, model, finish reason, duration, usage).

#### Scenario: Stable mock output
- **WHEN** the example input runs offline twice
- **THEN** both runs return identical text and all checks pass

### Requirement: Reject empty prompts
Prompts that are empty after trimming SHALL be rejected with `VALIDATION_FAILED` on `input.prompt` before any model call.

#### Scenario: Whitespace prompt
- **WHEN** the prompt is three spaces
- **THEN** the request fails with `VALIDATION_FAILED` for `input.prompt`

### Requirement: Safe fallback
Provider failures and empty answers SHALL be replaced by the learner-configured fallback message; raw provider error text SHALL NOT appear in the output or events; cancellation SHALL end the run as cancelled instead of using the fallback.

#### Scenario: Provider 503
- **WHEN** offline fault injection simulates HTTP 503
- **THEN** the output text equals the fallback message, `fallbackReason` is `provider-error`, and the events contain no raw provider message
