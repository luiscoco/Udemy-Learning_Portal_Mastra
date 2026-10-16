# Proposal

## Why

Learners need to create their first real Mastra `Agent`, register it on a `Mastra` instance and call it, understanding key versus id and how the model is configured.

## What Changes

- New lab `lab-03` (Module 01), available in the catalog.
- Run uses the real `@mastra/core` classes: `new Agent({ id, name, instructions, model })`, `new Mastra({ agents: { [key]: agent } })`, `getAgent(key)`, `getAgentById(id)`, `agent.generate(prompt, { abortSignal })`.
- Shared `ModelService` in `LabServices`: offline → deterministic scripted `LanguageModelV2` (records the system prompt it received); live → validated `provider/model` id that must be in `LIVE_MODELS` and have its API key configured, otherwise `NOT_CONFIGURED` naming the variable.
- Checks: registered, lookup by id, same instance, text returned, instructions delivered (offline-verifiable).

## Capabilities

### New Capabilities

- `course-labs/lab-03-create-and-register-a-first-agent`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-03/`, `packages/labs/src/services.ts`, API passes `process.env` to the model service (key presence only).
