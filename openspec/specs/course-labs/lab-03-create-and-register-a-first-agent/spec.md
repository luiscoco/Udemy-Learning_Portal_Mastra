# course-labs/lab-03-create-and-register-a-first-agent Specification

## Purpose
Lab 03: define a Mastra Agent, register it on a Mastra instance, look it up and generate text.

## Requirements

### Requirement: Define, register and invoke an agent
Lab 03 SHALL construct a Mastra `Agent` from the learner's id, name, instructions and model, register it on a `Mastra` instance under the learner's key, retrieve it with `getAgent` and `getAgentById`, and call `generate` with the prompt, streaming one workflow step per phase and one tool event per lookup.

#### Scenario: Offline invocation
- **WHEN** the lab runs offline with the example input
- **THEN** generate returns non-empty text from the simulated model, both lookups return the same instance and all checks pass

#### Scenario: Instructions delivered
- **WHEN** the lab runs offline
- **THEN** the result includes the system prompt the model received and it contains the learner's instructions

### Requirement: Configurable model
The model SHALL be selectable; offline mode simulates the chosen id, live mode calls it only when it is enabled and its provider key is configured, and unknown ids fail with `VALIDATION_FAILED` and an actionable reason.

#### Scenario: Live without key
- **WHEN** live mode is requested and the provider key is missing
- **THEN** the run fails with `NOT_CONFIGURED` naming the missing variable

#### Scenario: Unknown model
- **WHEN** the model id is `openai/gpt-99-ultra`
- **THEN** the run fails with `VALIDATION_FAILED`
