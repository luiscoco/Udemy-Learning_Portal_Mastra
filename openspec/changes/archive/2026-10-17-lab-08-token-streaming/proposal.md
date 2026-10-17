# Proposal

## Why

Streaming is how real chat UIs feel fast. Learners must stream with `agent.stream()`, forward tokens incrementally, and make cancellation and disconnects actually stop the model call.

## What Changes

- New lab `lab-08` (Module 02).
- Run: `agent.stream(prompt, { abortSignal })` on a real Mastra `Agent`; each `text-delta` chunk (`payload.text`) becomes a `token` event delivered over the existing SSE bridge; first-token and total times measured; chunk-type counts reported.
- Cancellation: the run signal (Cancel, deadline, client disconnect) is combined with a lab-owned controller used for an optional token budget ("stop after N tokens"). Because an aborted stream ends quietly, the lab checks the signal after the loop and reports cancellation instead of partial success.
- Offline: scripted model streams word by word with a configurable delay; live: provider streams at its own pace.

## Capabilities

### New Capabilities

- `course-labs/lab-08-token-streaming`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-08/`. Live = one streamed model call.
