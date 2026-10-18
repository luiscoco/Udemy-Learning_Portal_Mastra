# Proposal

## Why

A RAG agent is only trustworthy if every claim can be traced to a retrieved passage, and if it says "I don't know" when the documents do not cover the question. The model alone cannot be trusted with either:

- it can cite a chunk that was never retrieved, or misquote one;
- it can answer an unsupported question from general knowledge.

Learners need an agent that searches, answers with citations, and an app-level guard that verifies those citations before the answer is shown.

## What Changes

- **New lab `lab-40`** (Module 08): a Mastra `Agent` with Mastra's own `createVectorQueryTool` (`searchDocs`) over the course corpus. The corpus is indexed in the run with L39 section chunking and the L38 embedders.
  - **Answer format.** The agent must return JSON `{ answer, supported, citations: [{ chunkId, quote }] }`.
  - **Citation guard** (app-level, after the model):
    - every `chunkId` must be one this run's `searchDocs` calls returned;
    - every quote must appear verbatim in that chunk, after whitespace normalisation;
    - an answer that claims support needs at least one valid citation, and a retrieved score at or above `minScore`;
    - every number in a supported answer must appear in a cited quote.

    A violation blocks the answer and replaces it with an honest fallback ("I can't confirm that from the documents"), with the reasons listed.
- **Provenance.** Each accepted citation is expanded with its source document, chunk offsets and score, so the UI can show where the answer came from.
- **Offline.** A deterministic scripted model calls `searchDocs`, then quotes the best chunk's matching sentence, or refuses when nothing scores at or above `minScore`.
- **Contrast `offlineBehaviour: overconfident`.** For the unanswerable question it invents an answer with a fake citation and a made-up number. With `guard: on` that answer is blocked; with `guard: off` it is shown and the checks fail.
- **Live.** `gpt-5-mini` (or another configured model) with the same tool and guard. Embeddings are OpenAI.
- **Checks:**
  - `citations-map-to-chunks`;
  - `answers-grounded`;
  - `unsupported-handled`;
  - `numbers-grounded`;
  - `provenance-shown`.

## Capabilities

### New Capabilities

- `course-labs/lab-40-rag-qa-agent`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-40/` and `packages/labs/src/lab-38/embedders.ts` (additive: `model()` accessor). Live: about four agent turns with tool calls and a few hundred embedding tokens, roughly a cent.
