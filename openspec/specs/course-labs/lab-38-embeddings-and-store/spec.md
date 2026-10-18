# course-labs/lab-38-embeddings-and-store Specification

## Purpose
Lab 38 embeds document chunks with a configurable embedder (deterministic mock offline, OpenAI live) and stores them with source metadata in a vector index, proving the records are dimension-consistent, idempotent, retrievable and deterministic.

## Requirements

### Requirement: Configurable embeddings persisted to a vector store
Lab 38 SHALL embed document chunks with a configurable embedder (deterministic mock offline, provider models live) and persist them with source metadata in a supported vector store.

#### Scenario: Deterministic mock embeddings
- **WHEN** the example runs offline
- **THEN** every chunk is stored with a content-derived id and metadata (document, source, offsets, text, embedder, dimensions), and re-embedding the same text yields identical vectors

#### Scenario: Records retrievable
- **WHEN** each stored record is queried with its own vector
- **THEN** it is the top hit, and its metadata matches what was stored

### Requirement: Index integrity
The lab SHALL keep one embedder and one dimension per index, and make re-ingestion idempotent.

#### Scenario: Re-upsert
- **WHEN** the same records are upserted twice with content-derived ids
- **THEN** the index count does not change

#### Scenario: Random ids
- **WHEN** `idStrategy` is `random`
- **THEN** the second upsert duplicates the records and the idempotency check fails

#### Scenario: Dimension guard
- **WHEN** an index already exists with a different dimension than the embedder produces
- **THEN** the lab reports `DIMENSION_MISMATCH` instead of mixing vectors

### Requirement: Exact search on the persistent course store
The persistent course vector store SHALL search exactly, so that records stay retrievable after repeated idempotent re-ingestion.

#### Scenario: Many runs on one store
- **WHEN** the L38 example runs repeatedly against the same persistent store
- **THEN** every run finds each record as its own top hit, and the store has no approximate (`_vector_idx`) index
