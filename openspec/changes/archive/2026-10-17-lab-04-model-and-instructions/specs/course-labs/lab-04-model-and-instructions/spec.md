## ADDED Requirements

### Requirement: Validated model selection
Lab 04 SHALL accept only model ids present in the installed Mastra provider registry; an unsupported id SHALL be rejected before running with `VALIDATION_FAILED`, a field-level message for `modelId` and a list of tested ids.

#### Scenario: Unsupported model
- **WHEN** the learner enters `openai/gpt-99-ultra`
- **THEN** the request fails with `VALIDATION_FAILED` and the `input.modelId` detail names the tested ids

#### Scenario: Live model not enabled
- **WHEN** a registry-valid model not listed in `LIVE_MODELS` is used in live mode
- **THEN** the run fails with `NOT_CONFIGURED` explaining how to enable it

### Requirement: Same-input comparison
The lab SHALL run the same instructions and prompt against the selected model and the comparison model and show both outputs side by side.

#### Scenario: Identical inputs
- **WHEN** the lab runs offline
- **THEN** both simulated models received the identical system prompt and user message, verified by a check

### Requirement: Secret-free run record
The result SHALL record the effective configuration (model ids, providers, capability flags, instructions hash and length, prompt length, mode) and SHALL NOT contain API key values or key-shaped strings.

#### Scenario: Record has no secrets
- **WHEN** a provider key is configured on the server
- **THEN** the run record does not contain the key value
