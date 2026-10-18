# Design

## Context

Verified against `@mastra/rag` 2.6.6 (spike, `MDocument.fromText` / `fromMarkdown` followed by `chunk({ strategy, maxSize, overlap, addStartIndex: true })`):

- **`character` and `recursive`.** `metadata.startIndex` is correct for every chunk. Overlap is applied, for example a 20-character overlap between consecutive chunks. A splitter falling back to characters can cut mid-word ("…payment m" | "ethod.").
- **`token`.** `startIndex` is **`-1` for overlapping chunks** (2 of 4 in the spike), so it is not usable as an offset there.
- **`markdown`.** Splits by heading. `startIndex` is correct, but the `## ` heading markers are stripped from the chunk text.
- **`sentence`.** With `maxSize: 120` it produced a **one-character chunk `"."`**.
- **Recursive overlap is conditional.** It only appears inside segments that had to be cut. At `maxSize: 300` every handbook section fits, so an overlap of 60 adds nothing. At 200 the overlap is 146 characters.
- **Metadata.** Chunk metadata carries the document metadata, here `source`, plus `startIndex`.

## Decisions

- **Offsets are verified, never assumed.** For each chunk, in order:
  1. use `startIndex` if `source.slice(startIndex, startIndex + text.length) === text`. This is labelled `mastra`.
  2. otherwise search for the text starting from the previous chunk's start, then from 0. This is labelled `relocated`.
  3. otherwise `unlocated`, which fails `offsets-traceable`.
- **Degenerate chunks.** A chunk with no letter or digit after trimming is dropped from the output and listed under `dropped`, with its strategy and raw length.
- **Sizes.**
  - The unit is tokens for `token`, characters otherwise.
  - `sizes-within-limit` fails if any chunk exceeds `maxSize` in its unit.
  - Tokens are counted with `js-tiktoken` `cl100k_base` for every chunk, so all strategies can be compared.
- **Coverage.** The share of the source's letters and digits that fall inside at least one located chunk. This ignores markup removed by the `markdown` strategy. `source-covered` requires 100 %, so no content is lost.
- **Overlap** is measured as the intersection of consecutive chunk ranges within the same document, and reported as a statistic, not a check, because splitters only overlap within merged segments.
- **Sources.**
  - `sample` (default): two built-in documents, a Markdown handbook and a plain-text policy.
  - `library`: up to 5 documents from the L36 library, newest first; empty is an explicit message.
  - `paste`: 20–20,000 characters.
- **Bounds.** 1–4 configurations. `maxSize` is 20–4,000 characters or 10–1,000 tokens; `overlap` must be smaller than `maxSize`. Previews are 120 characters, and at most 200 chunks are returned per configuration (the count is still reported).
- **Mastra usage.** `MDocument` per document, then `chunk()` per configuration. A `workflow-step` event is emitted per configuration with its stats.

## Risks

- **`@mastra/rag` behaviour may change across versions** (for example `startIndex` for tokens). The verified-offset logic makes the lab independent of it, and the COMPATIBILITY row records the version.
