# Design

## Context

- **`@mastra/core/evals` `createScorer({ id, description })`** chains `.preprocess(fn)`, `.analyze(fn)`, `.generateScore(fn)` and `.generateReason(fn)`. Verified in a spike:
  - step functions receive `{ run: { input, output, groundTruth, requestContext, runId }, results: { preprocessStepResult, analyzeStepResult, … } }`;
  - `run()` returns `{ score, reason, … }`;
  - a step returning `notScorable(reason)` ends the run with `notScorable: { step, reason }` and no score;
  - re-running on the same input gives the same score.
- **Other evaluation packages.** `runEvals({ target: agent, data, scorers })` exists, but it drives a single agent target. Our pipeline is retrieval, then agent, then guard, so the suite calls `scorer.run()` per item directly. `@mastra/evals` 1.10.x (built-in faithfulness and answer-relevancy, LLM-judged) has the peer dependency `vitest >=3 <5`, which conflicts with the pinned vitest 5.0.5, so it is not installed.

## Decisions

- **Pipeline per item.**
  1. Retrieval with the selected method (L42 functions, k = `maxSources`, vector floor 0.25).
  2. Sources as in L44.
  3. If any sources, the L44 agent generates; otherwise the item gets no claims.
  4. `guardClaims` with enforce on. The raw verdicts measure faithfulness, and the shown claims measure abstention.

  Items run sequentially.
- **Scorers.**
  - The input is `{ item }` and the output is `{ retrieved: ids, verdicts, shownClaims }`. Ground truth is `{ relevant, answerable }`.
  - Each scorer's `generateReason` states the arithmetic, for example "2 of 3 retrieved passages are relevant".
  - Not-scorable rules: `retrieval-hit-rate` when `relevant` is empty; `context-relevance` when nothing was retrieved; `answer-faithfulness` when the model made zero claims; `abstention` when the item is answerable.
- **Aggregation.** The mean over scorable items, rounded to 4 decimals, as `{ mean, n, notScorable }`. If `n` is 0, the mean is `null` and the gate is reported as not applicable (pass with a note).
- **Gates.** Defaults: hit rate 0.8, context relevance 0.3, faithfulness 0.9, abstention 1.0, each 0–1. The context-relevance default is low on purpose: with k = 4 and mostly one relevant passage per question, the best possible precision is about 0.25–0.5, which the lab explains instead of hiding.
- **Summary lines.** Built from the aggregates only, each `metric: correct/n = mean (n = …, not scorable = …), gate ≥ g: PASS|FAIL`. `summary-verifiable` re-derives every number from the items.
- **Reproducibility.**
  - `rescoreIdentical`: every item is re-scored with fresh scorer instances on the stored outputs, and the results are compared exactly.
  - Offline, `rerunIdentical`: the suite runs a second time end to end and its aggregates are compared.
  - Live, only re-scoring is required (generation varies), and the output says so.
- **Output.** `items[]` (question, ground truth, retrieved ids, raw claims with verdicts, shown claims, per-metric score and reason, or the not-scorable reason), `aggregates`, `gates`, `summary`, `reproducibility`.
- **Expected numbers offline.**
  - hybrid / faithful: hit rate 1.0 (6/6), faithfulness 1.0, abstention 1.0;
  - `keyword-only` misses the paraphrased items, so hit rate falls below 0.8 and the gate fails;
  - sloppy: faithfulness falls below 0.9 and the gate fails.

## Risks

- **Small samples.** Eight items is a small sample. The lab says so in its concept and quiz, and no claim goes beyond "on these n items".
