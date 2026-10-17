# Proposal

## Why

Basic generation is the foundation of every agent feature: learners must call `agent.generate()`, record what produced each answer, refuse bad input and survive provider failures without leaking errors.

## What Changes

- New lab `lab-06` (Module 02).
- Prompt input validated server-side (trimmed, 1–2000 chars); `agent.generate(prompt, { abortSignal })` on a real Mastra `Agent`.
- Result metadata: request id, correlation id, Mastra runId, model, simulated flag, finishReason, response id, duration, prompt size, usage.
- Safe fallback for provider errors and empty answers (offline fault injection: HTTP 503, empty response); raw provider errors never reach output; cancellation is not treated as fallback.
- Shared `withLabLogger` routes Mastra's internal agent logs into the redacted run stream.

## Capabilities

### New Capabilities

- `course-labs/lab-06-basic-text-generation`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-06/`, `packages/labs/src/shared/agent-kit.ts`, `scripts/register-lab.mjs`.
