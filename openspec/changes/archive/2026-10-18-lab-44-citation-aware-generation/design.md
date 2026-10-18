# Design

## Context

- **L40's guard** checks one answer: chunk ids, verbatim quotes, numbers, and an honest fallback.
- **L42** provides deterministic hybrid retrieval (BM25 plus vector, RRF) with explained scores; L43 provides reranking. L44 reuses L42's retrieval to keep the focus on generation.
- **The web Run tab** renders lab output as JSON in "Result and automated checks". There is no component for structured answers yet.

## Decisions

- **Contract** (`CitedAnswerSchema`, zod, exported from contracts):

  ```
  { claims: [{ text, citations: [{ n: int ≥ 1, sourceId, quote, quoteStart, quoteEnd }] }],
    sources: Record<sourceId, { title, location, text }>,
    blocked: [{ text, reasons: string[] }],
    fallback: boolean }
  ```

  The offsets index into `sources[sourceId].text`. The web validates `output.citedAnswer` with this schema and renders nothing special when it does not parse, so unknown shapes are safe.
- **Web component.**
  - Claims are an ordered list. Each citation is a `<button>` showing `[n]`, with `aria-label="Open source n: <title>"`.
  - The dialog is a native `<dialog>` opened with `showModal()`. It gets `aria-labelledby` set to its heading, a Close button, and Escape (native). Focus returns to the invoking button on close.
  - The passage text is rendered as text nodes, with the quote range wrapped in `<mark>`. No HTML is injected, so the passage cannot run script.
  - Blocked claims appear in a "Blocked" list with their reasons. When `fallback` is set, a fallback notice is shown.
- **Retrieval.** L42's `bm25Scores` plus vector cosine (L38 embedder, `InMemoryVector` exact), fused with RRF (k = 60, vector floor 0.25). The top `maxSources` (default 4) passages with fused > 0 are the context. Their ids are the citation ids.
- **Generation prompt.** The question, then "Sources:" with each passage as `[<id>] <text>`, then the JSON contract and rules: one claim per fact, cite ids from the list, quote whole sentences verbatim, numbers only from quotes, and no claims without sources.
- **Offline scripted model.**
  - Parses the sources from the prompt. For each source whose text shares a question keyword (L42 tokens, stem-trimmed), it takes the sentence with the most keyword hits and emits a claim with the text equal to that sentence and one citation.
  - If there are none, it returns `{ "claims": [] }`.
  - `sloppy` appends three bad claims: one citing `kb-999` (unknown), one with a paraphrased quote, and one whose claim says "60 days" while the quote says 30.
- **Claim guard** (pure):
  - **normalisation:** whitespace collapsed and lower-cased for the quote match;
  - **offsets:** an exact case-sensitive search after normalising whitespace. If the exact search fails, the offsets are found by a case-insensitive search in the original text, so highlighting points at the real span;
  - **support:** at least 1 shared content word (L42 tokenizer, stopwords removed, length ≥ 4) between the claim and its quotes;
  - **numbers:** as in L40.

  Each citation is numbered in order of first appearance across accepted claims.
- **Checks:**
  - `every-claim-cited`: every shown claim has ≥ 1 citation, and the run has at least one claim or an honest fallback;
  - `unmatched-citations-blocked`: no shown citation fails a rule;
  - `sources-openable`: every shown citation's `sourceId` is in `sources`, and `text.slice(quoteStart, quoteEnd)` equals the quote after whitespace normalisation;
  - `numbers-grounded`: as in L40, per claim;
  - `expected-sources-cited`: each question's `expect.sources` are all cited.
- **Batch.** 1–4 questions, each with its own `citedAnswer`, so the output is `results[]`. To keep the generic web rendering simple, the output also has a top-level `citedAnswer` for the **first** question, and the web renders `output.citedAnswer` only.

## Risks

- **Live models may merge facts into one claim, or paraphrase quotes.** Paraphrased quotes are blocked, which is correct. The checks report it, and the instructions ask for one fact per claim with verbatim quotes.
