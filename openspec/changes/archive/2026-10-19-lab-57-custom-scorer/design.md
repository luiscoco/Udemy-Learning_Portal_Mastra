# Design

## Context

Verified with `@mastra/core` 1.78.0 (L45 row and a spike):

- `createScorer({ id, description }).preprocess().analyze().generateScore().generateReason()`.
- `scorer.run({ input, output, groundTruth })` returns `{ input, output, groundTruth, runId, score, reason, preprocessStepResult, analyzeStepResult }`. The full breakdown therefore comes from Mastra's own scorer run, not from a side channel.
- A step returning `notScorable(reason)` short-circuits: the result has `notScorable: { step, reason }` and no `score`.
- `@mastra/evals` is not installed (its vitest peer conflicts with the pinned vitest 5.0.5), so the lab uses a code scorer only.

## Decisions

- **Text normalisation** (`text.ts`):
  - `tokens(s)`: lower-cased `[a-z0-9]+` words, light stem (`ies→y`, `ing`, `ed`, `es`, `s`, for words longer than 4 letters).
  - `sentences(s)`: split on `.`, `!` or `?` followed by whitespace.
  - `containsPhrase(sentenceTokens, phraseTokens)`: a contiguous token sequence.
- **Rubric** `{ id, question, reference, keyPoints: [{ id, label, aliases[] }], topicTerms[], forbidden: [{ id, label, aliases[] }], maxWords, weights: { completeness: 0.6, relevance: 0.4 }, penalties: { forbidden: 0.25, overLength: 0.1 }, passThreshold: 0.7 }`.
- **Scorer steps:**
  - **preprocess:** fewer than 3 words → `notScorable('the answer has fewer than 3 words')`; otherwise `{ sentences: [{ text, tokens }], words }`.
  - **analyze:**
    - each key point: covered when any alias matches a sentence; the evidence is the first such sentence;
    - each sentence: on topic when it contains a topic term or covers a key point;
    - forbidden hits with their sentence;
    - over-length flag.
  - **generateScore:** the formula above, with each sub-score rounded to 4 decimals before weighting.
  - **generateReason:** one line per criterion, then `Score = …` with the numbers.
- **Score card** (`toScoreCard(rubric, run)`): criteria `completeness`, `relevance`, `forbidden-claims`, `length`, each `{ id, label, kind, weight, score, contribution, evidence[], missing[] }`. `formula` is the filled-in expression. `passed = score ≥ passThreshold`. For a not-scorable run, `score: null`, `notScorable: reason` and empty criteria.
- **Golden fixtures** (`golden.ts`): per rubric, the reference (1), a partial missing one point, an off-topic answer, a forbidden-claim answer and an empty one. The expected scores are hand-computed and written as numbers in the fixtures; the test also recomputes them.
- **Agent answer:** `answerSource: 'text' | 'agent'`. The agent has the L51 `search_sources` tool. Offline it answers with the first sentences of the top sources, which gives a realistic, imperfect answer; live it uses `modelId`.
- **Live finding and limitation (gpt-5-mini agent answers).** The agent's answers scored 1 (`workflow-steps`), 0.85 (`suspend-resume`, storage not mentioned, which is correct) and 0.7 (`tool-validation`). In the last one, "It validates inputs against that schema before the tool's execute function runs" is a real paraphrase of the key point "Validation happens before execute runs", but it matched no alias, so it counted as missing. Alias matching is deterministic and explainable, but it under-scores paraphrases. That is the trade-off against a model-graded scorer, and the lab states it instead of tuning the rubric to one answer.
- **Contract** `ScoreCardSchema` (`packages/contracts/src/score-card.ts`): `{ scorerId, rubricId, question, answer, reference, keyPoints[{ id, label }], score: number | null, notScorable: string | null, passThreshold, passed, criteria[], formula, reason, fixtures: [{ name, rubricId, expectedScore: number | null, actualScore: number | null, expectedPassed, actualPassed, ok }] }`. The web `ScoreCard` renders a header (score, pass badge, threshold), the criteria table, the evidence and missing lists, the formula, the reason and the fixtures table.
