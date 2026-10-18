# course-labs/lab-43-reranking Specification

## Purpose
Lab 43 reranks first-stage candidates with Mastra's rerankWithScorer, shows each candidate's rank before and after with its score components, keeps provenance intact, keeps ranks stable with a deterministic scorer, and guards against scorer replies that would crash or poison the ranking.

## Requirements

### Requirement: Inspectable reranking
Lab 43 SHALL rerank first-stage candidates with Mastra's `rerankWithScorer`, and show each candidate's rank before and after, with the score components.

#### Scenario: Reranking fixes a first-stage miss
- **WHEN** the example runs offline
- **THEN** for "What does error E-5003 mean?" the first stage ranks err-7001 above err-5003 and the reranked list puts err-5003 first, and every question's reranked top-1 is its expected passage

#### Scenario: Provenance retained
- **WHEN** candidates are reranked
- **THEN** every reranked result is one of the candidates, with the same id, document, source and text

### Requirement: Stable, validated scores
Ranks SHALL be stable with a deterministic scorer, and scorer output SHALL be validated before it reaches the ranking.

#### Scenario: Mocked scorer stability
- **WHEN** the same candidates are reranked twice with the keyword scorer, or with the scripted agent scorer offline
- **THEN** the orders and scores are identical

#### Scenario: Chatty scorer replies
- **WHEN** the scorer model replies "Relevance: 0.9" instead of a bare number
- **THEN** the call is flagged (`SCORER_ERROR`, because @mastra/rag rejects the reply), replaced by 0, the run completes, and no final score is NaN
