# Design

## Context

Verified against the installed `@mastra/memory` 1.38.0 (bundled docs `dist/docs/references/docs-memory-observational-memory.md`, plus a spike):

- **It exists and is documented.** OM was "Added in `@mastra/memory@1.1.0`". It is configured with `options.observationalMemory: true | { model, observation: { messageTokens, bufferTokens, … }, reflection: { observationTokens } }`. The defaults are a 30k-token observation threshold, a 40k-token reflection threshold, and async buffering on.
- **Supported storage.** The documented adapters include `@mastra/libsql`. OM requires storage.
- **Offline spike.** Synchronous mode (`bufferTokens: false`, `messageTokens: 120`) with a **scripted LanguageModelV2 as the Observer** worked offline:
  - the Observer was called once, after the history passed the threshold;
  - its system prompt begins "You are the memory consciousness of an AI assistant…";
  - the record from `storage.stores.memory.getObservationalMemory(threadId, resourceId)` contained `activeObservations`, `observedMessageIds`, `totalTokensObserved`, `pendingMessageTokens` and `generationCount`;
  - the main agent's next system prompt contained an `<observations>` block with the stored observations.
- **Exports.** The package exports `getObservationsAsOf`.

## Decisions

- **Feature detection is evidence-based, not version-only.** Each capability row is `{ name, available, evidence }`, for example "@mastra/memory 1.38.0 ≥ 1.1.0" or "storage.stores.memory.getObservationalMemory is a function". `nativeAvailable` is true only if every required row holds.
- **The fallback can never look native.** Its `implementation` value is the literal `fallback`. The label text appears in the result, the effective options and a log line. A check (`labelled-honestly`) fails if the run claims native but no native record exists, or if a run labelled native actually used the fallback.
- **Synchronous observation (`bufferTokens: false`)** makes the demo deterministic and immediate. The lesson explains that production uses async buffering and much larger thresholds.
- **The offline Observer** returns observations in OM's documented format (`* 🔴 (HH:MM) User stated …`). It extracts first-person statements from the transcript Mastra gives it, so what it "observes" really comes from the conversation.
- **The fallback** estimates tokens at about 4 characters per token. When history passes the threshold, it makes one model call ("summarize as dated bullet notes"), offline a deterministic summary, and stores the notes in working memory with a template. It is deliberately simple and documented as such.
- **Isolation.** Run-scoped user and thread ids, as in earlier memory labs. The database is `lab-25`.

## Risks

- **OM internals evolve quickly** (the record fields and prompt wording). Tests assert the documented behaviour (observations stored and injected), not the prompt text. The capability probe records the version that was tested.
