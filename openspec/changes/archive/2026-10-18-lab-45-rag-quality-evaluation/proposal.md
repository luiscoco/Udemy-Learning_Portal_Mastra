# Proposal

## Why

"The RAG works well" is not a measurement. Learners need a fixture suite that turns quality into numbers they can reproduce and inspect:

- **retrieval hit rate:** did we fetch a passage that contains the answer?
- **context relevance:** how much of what we fetched is relevant?
- **answer faithfulness:** are the model's claims supported by the fetched passages?
- **abstention:** do unanswerable questions get no answer?

Every number must come with its sample size and the per-item inputs and outputs behind it, so no quality claim goes beyond the evidence.

## What Changes

- **New lab `lab-45`** (Module 09). An evaluation suite over the L44 pipeline: L42 retrieval (`hybrid`, `vector-only` or `keyword-only`), then generation by the L44 agent (scripted offline, faithful or sloppy; the live model live), then the L44 claim guard.
- **Dataset.** Eight fixture items with ground truth, all visible in the input. Each item is `{ id, question, relevant: [passage ids], answerable }`: six answerable and two unanswerable.
- **Metrics,** each a Mastra scorer built with `createScorer` (`preprocess → analyze → generateScore → generateReason`), deterministic and code-based (no LLM judge):
  - `retrieval-hit-rate`: 1 if any ground-truth passage is in the retrieved top-k. Not scorable for unanswerable items.
  - `context-relevance`: relevant retrieved / retrieved. Not scorable when nothing was retrieved.
  - `answer-faithfulness`: claims verified by the L44 guard / claims the model wrote, measured on the model's raw claims before blocking. Not scorable when the model made no claims.
  - `abstention`: 1 if an unanswerable item shows no claims. Not scorable for answerable items.

  Aggregates are means over scorable items and always carry `n` and the not-scorable count.
- **Gates.** Learner-set minimum per metric, with defaults of hit rate 0.8, context relevance 0.3, faithfulness 0.9 and abstention 1.0. Each gate reports pass or fail with the numbers.
- **Summary.** Generated only from the computed aggregates ("hit rate 6/6 = 1.00 (n = 6)"). The check recomputes each number from the items.
- **Reproducibility.** The stored outputs are re-scored and must match exactly. Offline, the whole suite is run twice and must match exactly.
- **Checks:**
  - `metrics-reproducible`;
  - `samples-visible`;
  - `gates-met`;
  - `summary-verifiable`.

## Capabilities

### New Capabilities

- `course-labs/lab-45-rag-quality-evaluation`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-45/`. `@mastra/evals` is not installed: its peer range is `vitest <5`, and the platform pins vitest 5.0.5. Native `createScorer` from `@mastra/core/evals` is used instead. Offline is free; live makes one model call per answerable item.
