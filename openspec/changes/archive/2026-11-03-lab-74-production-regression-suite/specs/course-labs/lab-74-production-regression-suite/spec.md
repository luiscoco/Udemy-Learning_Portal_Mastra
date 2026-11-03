## ADDED Requirements

### Requirement: Regression gates lab
Lab 74 SHALL evaluate the platform's release gates on recorded evidence with learner-chosen thresholds, optionally re-measure the eval and tracing gates in the run, and show that an injected regression fails exactly its gate.

#### Scenario: Injected eval regression
- **WHEN** the learner injects an eval regression
- **THEN** the eval-regression gate fails with a finding and every other gate keeps its result

#### Scenario: Live answer quality
- **WHEN** live mode scores a real model's answer below the learner's threshold
- **THEN** the answer-quality gate fails and reports the score and the missing key points
