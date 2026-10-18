## ADDED Requirements

### Requirement: Grounded answers with provenance
Lab 40 SHALL answer questions with a Mastra agent that searches the documents with a vector query tool and cites the retrieved chunks, and SHALL show each citation's source, offsets and score.

#### Scenario: Citations map to source chunks
- **WHEN** the example's answerable questions run
- **THEN** each answer is supported, every citation's chunk id was retrieved in that run, every quote appears verbatim in its chunk, and every number in the answer appears in a cited quote

### Requirement: Unsupported questions handled honestly
The agent SHALL NOT present unsupported facts as answers.

#### Scenario: Unanswerable question
- **WHEN** a question is not covered by the documents
- **THEN** the shown answer says the documents do not cover it, with no citations

#### Scenario: Overconfident model blocked by the guard
- **WHEN** the model invents an answer with a fake citation and the guard is on
- **THEN** the answer is blocked, replaced by an honest fallback, and the block reasons (`UNKNOWN_CHUNK`, `QUOTE_NOT_FOUND`, `UNGROUNDED_NUMBER`, …) are reported

#### Scenario: Guard off
- **WHEN** the same invented answer is produced with the guard off
- **THEN** it is shown, and the citation and unsupported-handling checks fail
