# course-labs/lab-30-foreach-processing Specification

## Purpose
Lab 30 processes a validated document batch with Mastra .foreach() at bounded concurrency, keeps input order, and represents per-item failures as typed results so the rest of the batch survives.

## Requirements

### Requirement: Bounded-concurrency batch processing
Lab 30 SHALL process a validated array of documents with Mastra `.foreach()` at a learner-set concurrency and aggregate the results.

#### Scenario: Multiple documents
- **WHEN** the example batch of several documents runs at concurrency 2
- **THEN** every document has a result in input order, and the measured peak concurrency is at most 2

#### Scenario: Zero and one document
- **WHEN** the batch is empty or holds a single document
- **THEN** the run succeeds, the aggregate reports `empty` or a one-item `complete` result, and all checks pass

### Requirement: Partial failures represented
Item failures SHALL be represented as typed per-item errors without discarding successful results.

#### Scenario: One bad document
- **WHEN** one document is too short and another is flagged to fail
- **THEN** those items carry `EMPTY_DOCUMENT` and `PROCESSING_FAILED`, the others keep their summaries, and the batch status is `partial`

#### Scenario: Throwing instead of capturing
- **WHEN** `failureHandling` is `throw`
- **THEN** the workflow fails, `aggregate` does not run, no results are kept, and the partial-failure check fails
