# Design

## Context

Verified against the installed `@mastra/memory` 1.38.0 (spike):

- **The tool.** `workingMemory: { enabled: true, scope: 'resource', schema }` gives the agent a tool named `updateWorkingMemory`. Its JSON input schema is `{ memory: <schema as JSON Schema, additionalProperties: false> }`.
- **The system prompt** carries the current working memory, plus instructions to call the tool with the entire JSON content.
- **Valid tool updates are stored and merged.** `{ name, seat }` followed by `{ dietary: ['vegan'] }` gives `{ name, seat, dietary }`.
- **Invalid tool updates are rejected.** `{ seat: 'roof' }` returns `{ error: true, message: 'Tool input validation failed … seat: Invalid option: expected one of "window"|"aisle"' }`, and stored memory is unchanged.
- **Resource scope.** A new thread for the same resource sees the stored values in its system prompt.
- **`memory.getWorkingMemory({ threadId, resourceId })`** returns the JSON string.
- **Direct writes bypass the schema.** `memory.updateWorkingMemory({ threadId, resourceId, workingMemory: '{"seat":"roof"}' })` is **accepted without validation and replaces** the whole record.

## Decisions

- **Strict schema, partial patches.** `PreferencesSchema` is the agent's schema and the oracle for the checks. Patches use `.partial().strict()`, so unknown keys are rejected too. Dietary values must be unique, and there are at most 3.
- **`ProfileService` is the only direct writer.** It parses the stored JSON, applies the patch, validates the merged result and writes the full JSON. It returns `{ ok, applied | errors[] }` with paths and messages. With validation off (`raw`), patches are written as-is, mirroring the verified Mastra behaviour: no validation, and the record is replaced.
- **Run-scoped users.** As in L22, the resource is `<runId8>:traveller`. Conversation 1 and the follow-up use different thread ids, which proves the resource scope.
- **A deterministic offline model.**
  - It extracts the fields stated in each message and calls the tool with that partial object, relying on Mastra's merge.
  - An invalid seat word is passed through, so the tool rejects it.
  - On the follow-up, it answers from the working memory values in its system prompt.
- **Checks are mode-independent where possible.**
  - Survival is checked through the answer, which must mention the stored seat, airport and dietary values, and through the stored record.
  - Tool rejection is checked through stream traces (`invalid`).
  - In live mode, a model that refuses the invalid request on its own still passes, because the check requires that no invalid value was stored.

## Risks

- **Concurrent tool updates.** Mastra serializes them with a mutex, as `updateWorkingMemoryMutexes` in its type definitions suggests. Direct writes in this lab are sequential, so no concurrency issue applies here.
