## ADDED Requirements

### Requirement: Exact search on the persistent course store
The persistent course vector store SHALL search exactly, so that records stay retrievable after repeated idempotent re-ingestion.

#### Scenario: Many runs on one store
- **WHEN** the L38 example runs repeatedly against the same persistent store
- **THEN** every run finds each record as its own top hit, and the store has no approximate (`_vector_idx`) index
