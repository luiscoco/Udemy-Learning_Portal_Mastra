# Proposal

## Why

Instructions are the main lever for agent behaviour. Learners need a controlled experiment: two instruction profiles, everything else identical, outputs side by side and traceable to the exact configuration that produced them.

## What Changes

- New lab `lab-07` (Module 02).
- Inputs: model, prompt, and two variants (label + instructions each).
- Run: two real Mastra `Agent`s with the same model, prompt and execution options; each output is linked to a config record (label, model, instructions SHA-256 prefix, settings) by `configHash`.
- Comparison saved server-side as JSON under the data directory (`comparisons/`, newest 20 kept); the result lists recent saved comparisons.
- Checks: both outputs, identical settings (verified offline from what each model received), variants actually differ, outputs linked to configs, comparison saved.
- Offline uses the labelled simulator (reacts to instruction cues); live calls the selected model twice.

## Capabilities

### New Capabilities

- `course-labs/lab-07-behavior-and-instruction-variants`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-07/`. Live = two model calls.
