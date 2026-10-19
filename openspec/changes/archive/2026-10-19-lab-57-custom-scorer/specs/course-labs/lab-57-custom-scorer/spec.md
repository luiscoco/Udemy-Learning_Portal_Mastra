## ADDED Requirements

### Requirement: Deterministic rubric scorer
Lab 57 SHALL score an answer against a rubric and an expected output with a Mastra `createScorer` scorer whose completeness, relevance and penalties are computed by code, and SHALL return the same score and reason for the same input on every run.

#### Scenario: Partial answer
- **WHEN** the `workflow-steps` rubric scores an answer that covers two of its three key points and stays on topic
- **THEN** the score is 0.6·(2/3) + 0.4·1 = 0.8, the missing key point is named, and the formula shows these numbers

#### Scenario: Not scorable
- **WHEN** the answer is empty
- **THEN** the scorer returns `notScorable` with a reason and no score

### Requirement: Scorer fixtures and rationale
Each run SHALL execute the golden scorer fixtures and SHALL expose the rationale of every score.

#### Scenario: Fixtures pass
- **WHEN** any lab run completes
- **THEN** every golden fixture returns its expected score, pass flag and missing points, and the reference answer of each rubric scores 1

#### Scenario: Rationale
- **WHEN** an answer is scored
- **THEN** the score card lists each criterion with its weight, sub-score, contribution, evidence and missing items, and the contributions add up to the score
