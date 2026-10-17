# Proposal

## Why

Every agent call carries execution options:

- which model,
- generation settings (temperature, max output tokens),
- provider-specific options (reasoning effort),
- loop bounds (`maxSteps`),
- time limits.

Models differ in what they support, and some unsupported settings are dropped silently. The spike showed that temperature sent to `openai/gpt-5-mini` returns no error and no warning. Learners need a UI that only offers what the chosen model supports, a server that enforces the same rules, and a record of the options that were actually applied.

## What Changes

- **Contracts (additive).** Input fields and select options gain an optional `visibleWhen: { field, in: string[] }`. The lab definition contract checks that the referenced field exists and is declared earlier.
- **Web form.**
  - Hidden fields are not rendered and not submitted.
  - Hidden options are not offered.
  - When the controlling field changes, a selected option that has become hidden switches to the first visible one.
- **New lab `lab-19`** (Module 04):
  - **Capabilities from the registry.** Per-model capabilities come from the installed Mastra provider registry: `modelSupportsTemperature` and `getModelReasoningOptions`.
  - **What the UI offers.** It shows temperature only for models that support it, and reasoning effort only for models with effort controls and only their values.
  - **What the server enforces.** It validates the same rules (422 when the UI is bypassed) and applies:
    - `modelSettings` (`maxOutputTokens`, `temperature`, `timeout.stepMs`),
    - `providerOptions.openai.reasoningEffort`,
    - `maxSteps`.
  - **Effective options recorded.** The run records what was applied, what was omitted (with the reason) and what was left to the provider default. Offline, the model's received call options are recorded on every call and compared.
  - **Bounded iteration.** A place-lookup tool needs one step per stop. Too few steps ends the loop without an answer (`finishReason: tool-calls`). Too few output tokens ends with `finishReason: length`. Both are reported as limits that were hit.

## Capabilities

### New Capabilities

- `course-labs/lab-19-execution-options`

### Modified Capabilities

- `lab-contracts`: conditional input visibility (added requirement)
- `lesson-workspace`: Run tab honours conditional visibility (added requirement)

## Impact

- **Code:** `packages/contracts/src/lab.ts`, `apps/web` (form model and DynamicForm), `packages/labs/src/lab-19/`.
- **Compatibility:** existing labs are unaffected because the field is optional.
- **Cost:** offline is free. Live mode makes up to `maxSteps` model calls.
