# Proposal

## Why

Evaluation needs scores that can be trusted and explained. A model-graded score is useful but neither deterministic nor free. Many quality questions ("did the answer cover the expected points, did it stay on topic, did it repeat a known-wrong claim?") can be scored by code, against a rubric and an expected output. That score is identical on every run and can say exactly why it is what it is.

The DoD asks for a deterministic relevance/completeness scorer with a rubric and expected output, whose fixtures pass and which exposes its rationale.

## What Changes

- **New lab `lab-57`** (Module 12): a scorer `rubric-answer-scorer` built with Mastra's `createScorer` (`@mastra/core/evals`) as `preprocess → analyze → generateScore → generateReason`.
  - **Rubric** (`rubrics.ts`): three rubrics about course topics (`workflow-steps`, `suspend-resume`, `tool-validation`). Each one has:
    - the question and an expected reference answer;
    - key points with aliases;
    - topic terms;
    - forbidden (known-wrong) claims;
    - a word limit and a pass threshold.
  - **Criteria** (weights in the rubric):
    - completeness = covered key points / key points (0.6);
    - relevance = on-topic sentences / sentences (0.4);
    - penalties: −0.25 per forbidden claim, −0.1 over the word limit.

    Score = clamp(0.6·completeness + 0.4·relevance − penalties, 0, 1), rounded to 4 decimals.
  - **Matching** is deterministic: lower-cased tokens with a light stemmer, and contiguous alias phrases. Each covered point records its evidence sentence; each off-topic sentence and forbidden hit is listed.
  - `notScorable` for an empty or too-short answer (fewer than 3 words).
- **Answer source:** score the learner's text, or let an agent answer the question first (offline scripted from the course sources; live with a real model). The scorer is always deterministic.
- **Golden scorer fixtures** (`fixtures` in `golden.ts`): for each rubric, the reference answer (score 1), a partial, an off-topic, a forbidden-claim and an empty answer, each with the exact expected score, pass flag and missing points. They run on every lab run.
- **Determinism:** each run scores the same answer twice and compares the score and the reason.
- **Rationale:** a new contract `ScoreCardSchema` (`output.scoreCard`) carries the criteria (weight, sub-score, contribution, evidence, missing), the formula with the numbers filled in, the reason text, the pass flag and the golden-fixture results. A new web component `ScoreCard` renders it. It is reusable by L58–L60.
- **Checks:** `scorer-fixtures-pass`, `rationale-exposed`, `deterministic`, `reference-scores-full`, `not-scorable-handled`.

## Capabilities

### New Capabilities

- `course-labs/lab-57-custom-scorer`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-57/`, `packages/contracts/src/score-card.ts`, `apps/web/src/components/workspace/ScoreCard.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, registry, COMPATIBILITY row.
- **Modes:** offline (free) and live (only when the answer source is the agent: one model call).
