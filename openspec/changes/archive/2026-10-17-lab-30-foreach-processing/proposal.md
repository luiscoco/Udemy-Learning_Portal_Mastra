# Proposal

## Why

Batch work (summarising a set of documents, enriching records) is the most common workflow shape after a single step. Mastra's `.foreach(step, { concurrency })` processes an array, but learners need to see three things that are easy to get wrong:

- concurrency must be bounded so a batch does not flood the provider;
- an empty or single-item batch must behave like any other size;
- one bad item must not discard the results of all the others.

## What Changes

- **New lab `lab-30`** (Module 06): a `document-batch` workflow `.foreach(processDocument, { concurrency }) → .then(aggregate)` over a learner-edited, Zod-validated array of 0–12 documents.
  - **`processDocument`** checks the document has enough content (fewer than 5 words is the typed error `EMPTY_DOCUMENT`), honours an optional `simulateFailure` flag (the typed error `PROCESSING_FAILED`), then asks an agent for a structured `{ summary, keywords }`. It returns a per-item result union `{ ok: true, … } | { ok: false, error: { code, message } }`.
  - **`aggregate`** builds counts, per-item results in input order, top keywords and a batch status: `empty`, `complete`, `partial` or `all-failed`.
- **Measured concurrency.** An app-level in-flight counter reports peak concurrency; the per-iteration progress Mastra streams appears as timeline events.
- **Contrast toggle `failureHandling`:**
  - `capture` (default): failures become data;
  - `throw`: the item step throws, so Mastra fails the whole step, `aggregate` never runs and the successful results are lost.
- **Shared helper.** `streamWorkflow` gains handling for `workflow-step-progress` chunks: one timeline event and one `iterations` record per item. This is additive; existing labs are unaffected.

## Capabilities

### New Capabilities

- `course-labs/lab-30-foreach-processing`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-30/` and `packages/labs/src/shared/workflow-stream.ts` (additive). Offline is free. Live mode makes one model call per valid document.
