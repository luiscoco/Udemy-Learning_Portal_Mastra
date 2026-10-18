# Design

## Context

Verified against `@mastra/rag` 2.6.6 and `@mastra/core` 1.78.0 (spike, offline):

- **Creating the tool.** `createVectorQueryTool({ id, description, vectorStore, indexName, model })` accepts a vector store **instance** (no Mastra registration needed). It works with the in-memory store and the mock embedding model.
- **Input.** `{ queryText: string, topK: number }`, where `topK` is coerced. A scripted call with missing arguments got a structured validation error back, not an exception.
- **Output.** `{ relevantContext, sources }`:
  - `relevantContext` is the stored metadata of each hit (here `id`, `docId`, `source`, `start`, `end`, `text`);
  - `sources` has `{ id, score, metadata, vector, document }`, with `document` empty for our records.
- **No minimum score.** The tool returns its top-k hits however weak, so an unanswerable question still gets context. The mock's best score for "Do you offer a student discount?" was 0.033.
- **Scripted tool calls** use `toolCalls: [{ toolName, input }]`.

## Decisions

- **Retrieval tool.** The agent uses `createVectorQueryTool` as provided: `id: 'searchDocs'`, a description instructing it to search before answering, `topK` from the input (default 3). The lab wraps it to record what was retrieved in each call: chunk ids, texts, scores and sources. This record is the ground truth for the guard.
- **Answer contract.** JSON in the final text: `{ answer: string, supported: boolean, citations: [{ chunkId, quote }] }`, parsed with Zod. Text outside JSON or invalid JSON counts as `UNPARSEABLE`, and the guard falls back. A plain JSON contract is used instead of `structuredOutput` with tools, to avoid depending on how a version combines the two.
- **Guard rules** (all must hold for a supported answer):
  1. at least one citation;
  2. every `chunkId` was retrieved in this run (otherwise `UNKNOWN_CHUNK`);
  3. every quote is in the chunk text after whitespace normalisation (otherwise `QUOTE_NOT_FOUND`);
  4. the best score among cited chunks is at or above `minScore` (otherwise `WEAK_SUPPORT`);
  5. every number in the answer (digits, incl. decimals) appears in some cited quote (otherwise `UNGROUNDED_NUMBER`).

  An unsupported answer must have no citations, and its text is kept. A blocked answer is replaced by: "I can't confirm that from the documents I searched." followed by the reasons.
- **The offline scripted model:**
  - **First turn:** call `searchDocs({ queryText: lastUser, topK })`.
  - **Second turn, faithful:** take the best source at or above `minScore` and the first sentence of its chunk containing a question keyword (otherwise its first sentence). Answer with that sentence, `supported: true`, and a citation `{ chunkId, quote: sentence }`. If nothing scores high enough, answer "The documents don't say…" with `supported: false` and no citations.
  - **Second turn, overconfident:** same as faithful, except that for an unsupported question it answers "Yes, students get a 15% discount on all orders." with a citation to `C-unknown` and a made-up quote.
- **Batch.** 1–5 questions, each a separate `agent.generate` with `maxSteps: 4`. Each question can declare `expect: { docId, contains }` (a grounded answer whose citations include `docId`, and whose answer or quote contains the phrase) or `"unsupported"`.
- **Example.** Three answerable questions (refund window, express delivery, chat transcript retention) and one unanswerable one (student discount).
- **Checks:**
  - `citations-map-to-chunks`: every citation in a *shown* answer passes rules 2–3;
  - `answers-grounded`: answerable questions are shown supported with an expected-document citation and the phrase;
  - `unsupported-handled`: unanswerable questions are shown unsupported with no citations, by the model or by the guard;
  - `numbers-grounded`;
  - `provenance-shown`: every shown citation has a source name, offsets and a score.
- **Live.** Any configured model from `DEFAULT_LIVE_MODELS`, with OpenAI embeddings. The instructions demand the JSON contract and quoting verbatim. The guard makes the result safe either way, and the checks report whether the model complied.

## Risks

- **Live models may paraphrase quotes.** The guard blocks those answers, which is correct behaviour but fails `answers-grounded`. The instructions demand verbatim quotes, and the live check is the evidence.
