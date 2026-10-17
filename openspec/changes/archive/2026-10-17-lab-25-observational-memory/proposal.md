# Proposal

## Why

Long conversations outgrow the context window. Observational Memory (OM) is Mastra's answer:

- an **Observer** agent condenses older messages into dense, dated observations that replace the raw history;
- a **Reflector** agent compresses the observations further.

The owner's prompt asks the lab to evaluate the *current* capability, feature-detect it, demonstrate it when it is available, and otherwise offer a documented fallback that is never presented as native.

## What Changes

- **New lab `lab-25`** (Module 05).
- **Capability probe.** `probeObservationalMemory()` records evidence for each capability:
  - the installed `@mastra/memory` version against the documented minimum (`1.1.0`);
  - whether `Memory` accepts `options.observationalMemory`;
  - the `getObservationsAsOf` export;
  - the storage adapter's `getObservationalMemory` read API;
  - whether the configured storage is a documented OM adapter (`@mastra/libsql`).

  The probe result is part of every run's output, and a test asserts it.
- **Implementation selector:**
  - `auto` uses native when the probe passes and the fallback otherwise;
  - `native` requires the probe to pass and is refused with `NOT_CONFIGURED` if it doesn't;
  - `fallback` runs the app-level alternative.
- **Native path.** `Memory({ options: { observationalMemory: { model, observation: { messageTokens, bufferTokens: false } } } })`, with a learner-set threshold. The lab reads `getObservationalMemory(threadId, resourceId)` and shows:
  - the active observations;
  - which messages were observed;
  - the observed and pending token counts;
  - the number of Observer calls.
- **Fallback path.** It is labelled `fallback (app-level, not Mastra observational memory)` in the output, in the effective options and in the UI text. When estimated history tokens pass the threshold, the app summarizes the history into notes with the model and stores them in working memory. The lesson explains how it differs from native OM: no Reflector, no buffering, and no message replacement.
- **Models.**
  - Offline: a scripted Observer that extracts the user's stated facts deterministically.
  - Live: the selected model is used as the Observer. Background Observer calls cost tokens, and the cost notice says so.

## Capabilities

### New Capabilities

- `course-labs/lab-25-observational-memory`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-25/`. Offline is free. Live mode makes one model call per turn plus Observer calls: about 6 in the example.
