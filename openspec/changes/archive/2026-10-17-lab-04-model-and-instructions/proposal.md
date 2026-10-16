# Proposal

## Why

Choosing a model and writing instructions are the two biggest levers on agent behaviour. Learners must pick only models the installed Mastra version supports, see actionable errors otherwise, and compare outputs for the same input.

## What Changes

- New lab `lab-04` (Module 01).
- Inputs: free-text primary model id (validated in the input schema against Mastra's provider registry, so unsupported ids fail with a field-level message and suggestions), comparison model (select of tested ids), editable instructions, prompt.
- Run: two real `Agent`s with identical instructions and prompt, one per model, generated in sequence; offline each model id gets a clearly labelled simulated style. Live mode requires both ids in `LIVE_MODELS` with keys.
- Run record (`effective`): model ids, providers, capabilities, instructions SHA-256 and length, prompt length — never keys.
- Preflight lists live-enabled models and whether their key is configured (names only).

## Capabilities

### New Capabilities

- `course-labs/lab-04-model-and-instructions`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-04/`. Offline free; live = two model calls.
