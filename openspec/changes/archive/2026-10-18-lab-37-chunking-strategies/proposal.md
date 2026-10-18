# Proposal

## Why

Chunking decides what a retriever can find. Learners need to see how strategy, size and overlap change the chunks: their count, their size in characters and tokens, cut points and duplicated overlap. They also need to see that every chunk must stay traceable to its exact place in the source. A chunk without a source and an offset cannot be cited later (L40, L44), and empty or degenerate chunks waste embedding calls and pollute retrieval.

## What Changes

- **New lab `lab-37`** (Module 08), offline only, no model. It chunks documents with `@mastra/rag` `MDocument`, using up to 4 configurations side by side, chosen from the `character`, `recursive`, `token`, `markdown` and `sentence` strategies, each with its own `maxSize` and `overlap`.
- **Sources:**
  - built-in course documents (the default; deterministic);
  - the L36 document library (up to 5 stored documents);
  - pasted text.
- **Per chunk:** id, source document, index, `start`/`end` offsets, chars, tokens (cl100k), overlap with the previous chunk, and a preview.
- **Traceability.** The `startIndex` that Mastra reports is used only when it verifies, meaning `source.slice(start, end) === text`. Otherwise the app relocates the chunk in the source. Every offset is labelled `mastra`, `relocated` or `unlocated`.
- **Empty and degenerate chunks** (no letter or digit, for example a lone `"."`) are dropped by the app and reported with their strategy.
- **Stats per configuration:** count, min/avg/max chars and tokens, total overlap, and coverage of the source's letters and digits.
- **Checks:**
  - `no-empty-chunks`;
  - `offsets-traceable`;
  - `sizes-within-limit`;
  - `source-covered`.
- **Dependencies:** `@mastra/rag@2.6.6` (2.6.7 was a week old) and `js-tiktoken@1.0.21`, pinned in `packages/labs`. `DocumentLibrary` gains `list()` (additive) and a `courseLibrary(services)` helper, shared with later RAG labs.

## Capabilities

### New Capabilities

- `course-labs/lab-37-chunking-strategies`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-37/` and `packages/labs/src/lab-36/library.ts` (additive). No provider cost.
