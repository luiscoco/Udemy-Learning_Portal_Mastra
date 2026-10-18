# Proposal

## Why

L40 verified an answer as a whole. Real answers combine several facts from several sources, and a reader needs to know **which source supports which claim**, and to open that source and see the exact sentence. Citation-aware generation means:

- every claim carries its own citations;
- a citation that does not match its source is blocked;
- the user can open the passage behind every citation.

## What Changes

- **Contract (additive).** `CitedAnswerSchema` in `packages/contracts`:
  - `claims: [{ text, citations: [{ n, sourceId, quote, quoteStart, quoteEnd }] }]`;
  - `sources: { [sourceId]: { title, location, text } }`;
  - `blocked: [{ text, reasons }]`;
  - a fallback flag.

  Any lab output with a `citedAnswer` field can use it.
- **Web.** A generic `CitedAnswer` component in the Run tab, shown when the result output has a valid `citedAnswer`:
  - claims render with numbered citation buttons;
  - a button opens an accessible dialog (`role="dialog"`, labelled, Escape and Close work, focus returns to the button) showing the source's title and location and the full passage, with the quoted span highlighted (`<mark>`);
  - blocked claims are listed with their reasons.
- **New lab `lab-44`** (Module 09).
  - **Retrieval:** L42 hybrid search (BM25 + vector, RRF) over the L42 passages, keeping the top 4 passages with any keyword or vector support.
  - **Generation:** a Mastra `Agent` receives the passages labelled with their ids and must return JSON `{ claims: [{ text, citations: [{ id, quote }] }] }`. Offline, a scripted model builds one claim per relevant passage from its best sentence. Live, it uses `gpt-5-mini` (or the selected model).
  - **Claim guard** (app-level, per claim):
    - the citation's passage must be among those provided (`UNKNOWN_SOURCE`);
    - the quote must appear verbatim in that passage (`QUOTE_NOT_FOUND`);
    - the claim must share content words with its quotes (`UNSUPPORTED_CLAIM`);
    - every number in the claim must appear in its quotes (`UNGROUNDED_NUMBER`);
    - a claim must have at least one citation (`UNCITED_CLAIM`).

    Only invalid claims are blocked; valid ones are shown with absolute quote offsets for highlighting. If nothing survives, an honest fallback is shown.
  - **Contrasts.** `offlineBehaviour: sloppy` adds an invented claim with a fake source, a paraphrased "quote", and a claim with a wrong number. `guard: off` shows them anyway, and the checks fail.
- **Checks:**
  - `every-claim-cited`;
  - `unmatched-citations-blocked`;
  - `sources-openable`;
  - `numbers-grounded`;
  - `expected-sources-cited`.
- **e2e.** Run L44, open citation [1], see the passage with the highlighted quote, close with Escape, and pass an accessibility scan.

## Capabilities

### New Capabilities

- `course-labs/lab-44-citation-aware-generation`

### Modified Capabilities

- `lesson-workspace` (cited-answer rendering in the Run tab)

## Impact

`packages/contracts` (additive schema), `apps/web` (new component and Run tab integration), `packages/labs/src/lab-44/`. Live: one model call per question plus a few hundred embedding tokens.
