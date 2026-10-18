## ADDED Requirements

### Requirement: App-side hybrid retrieval with explained scores
Lab 42 SHALL combine BM25 keyword retrieval and vector retrieval with an explicit fusion method, and every hybrid result SHALL explain its score from its components.

#### Scenario: Hybrid fixes both single-method misses
- **WHEN** the example runs offline with RRF
- **THEN** each question's expected passage ranks first; keyword-only misses the paraphrased questions; vector-only misses the exact error code; hybrid accuracy is at least that of either single method

#### Scenario: Scores explained
- **WHEN** a hybrid hit is shown
- **THEN** it lists its BM25 score, rank and matched terms, its cosine and rank, the normalised components, and the fused score, which recomputes exactly from those components

### Requirement: Deterministic fusion
Fusion SHALL be pure and deterministic.

#### Scenario: Same inputs, same order
- **WHEN** the same keyword and vector rankings are fused twice, or in a unit test with fixed scores
- **THEN** the order and the fused values are identical, with ties broken by passage id
