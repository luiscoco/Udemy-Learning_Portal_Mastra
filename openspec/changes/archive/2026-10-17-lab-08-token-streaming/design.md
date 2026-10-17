# Design

## Context

Verified with the installed version: `agent.stream()` resolves to an object whose `fullStream` yields `start`, `step-start`, `text-start`, `text-delta` (`payload.text`), `text-end`, `step-finish`, `finish`; `text`, `finishReason` and `usage` are promises. Aborting the passed `abortSignal` ends the `for await` loop without throwing.

## Decisions

- `AbortSignal.any([ctx.signal, local.signal])`: one signal for engine-driven aborts (Cancel, deadline, disconnect grace) and lab-driven budget stops.
- `ctx.throwIfAborted()` after the loop converts a quiet stream end into the engine's cancelled/timeout terminal state.
- Budget stops are reported as success with `finishReason: 'budget'` (deliberate, not an error); usage is omitted because the provider did not finish.
- Offline pacing uses the scripted model's `tokenDelayMs`, which also honours the abort signal between words.
