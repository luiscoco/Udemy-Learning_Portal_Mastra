# course-labs/lab-39-vector-retrieval Specification

## Purpose
Lab 39 runs top-k vector retrieval with similarity scores, a minimum-score threshold and traceable source snippets, retrieves known fixture questions in the expected order, and handles empty indexes and unrelated questions explicitly.

## Requirements

### Requirement: Top-k semantic search with scores and snippets
Lab 39 SHALL run top-k vector search for each question and return ranked hits with similarity scores and traceable source snippets.

#### Scenario: Known fixtures in expected order
- **WHEN** the example questions run against the course corpus indexed with section chunking
- **THEN** each answerable question's rank-1 hit is the expected document and contains the expected phrase, scores are non-increasing, and every snippet equals the source text at its offsets

#### Scenario: Unrelated question
- **WHEN** a question matches nothing above `minScore`
- **THEN** it reports `no-relevant-results` with no hits

#### Scenario: Heading-only chunks
- **WHEN** the corpus is indexed with 200-character recursive chunks
- **THEN** a heading-only chunk ranks first for the refund question and the expected-order check fails

### Requirement: Empty index handled
Searching an empty index SHALL return an explicit outcome instead of an error.

#### Scenario: Empty index
- **WHEN** the index has no records
- **THEN** every question reports `empty-index` with no hits, and the run succeeds
