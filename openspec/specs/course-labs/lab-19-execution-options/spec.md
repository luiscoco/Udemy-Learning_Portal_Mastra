# course-labs/lab-19-execution-options Specification

## Purpose
Lab 19 teaches per-call execution options: model settings, provider options, maxSteps and per-call timeouts, offered only where the model supports them and recorded as effective options.

## Requirements

### Requirement: Only supported options are exposed
Lab 19 SHALL derive each model's supported options from the installed Mastra provider registry and offer only those in the UI; the server SHALL reject unsupported values with `VALIDATION_FAILED`.

#### Scenario: Temperature on a reasoning model
- **WHEN** the model is `openai/gpt-5-mini`
- **THEN** the temperature field is hidden and reasoning effort offers `minimal`, `low`, `medium`, `high`

#### Scenario: Temperature on a supporting model
- **WHEN** the model is `anthropic/claude-haiku-4-5`
- **THEN** temperature is offered and reasoning effort is hidden

#### Scenario: UI bypassed
- **WHEN** an API client sends `temperature` with `openai/gpt-5-mini`
- **THEN** the run is refused with 422 `VALIDATION_FAILED` on `input.temperature`

### Requirement: Effective options recorded
Every run SHALL record the effective model, `maxSteps`, model settings, provider options, omitted options with reasons and provider defaults; offline runs SHALL also record the options each model call actually received.

#### Scenario: Example run
- **WHEN** the example runs (gpt-5-mini, effort `low`, 1500 max output tokens, 4 steps)
- **THEN** the effective options show `providerOptions.openai.reasoningEffort: low`, temperature is listed as omitted (not supported), and every recorded model call received the same settings

### Requirement: Bounded iteration and limits
The lab SHALL bound the tool loop with `maxSteps` and report when a limit was hit.

#### Scenario: Too few steps
- **WHEN** a three-stop plan runs with `maxSteps: 2`
- **THEN** the run succeeds with steps used equal to 2, `limitsHit` includes `maxSteps`, and the `answer-complete` check fails

#### Scenario: Too few output tokens
- **WHEN** `maxOutputTokens` is 64 and the answer is longer
- **THEN** the finish reason is `length` and `limitsHit` includes `maxOutputTokens`
