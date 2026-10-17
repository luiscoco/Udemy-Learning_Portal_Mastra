## ADDED Requirements

### Requirement: Vector stores and embedders for memory
The platform SHALL let labs open durable memory with a vector store and an embedder, provide a durable LibSQL vector store per name, an in-memory stub vector store for tests, a recording decorator that captures every upsert and query, and a deterministic offline embedder labelled as a stand-in.

#### Scenario: Stubbed vector service
- **WHEN** a test opens memory with `InMemoryVector` and semantic recall enabled
- **THEN** messages are upserted into the stub and recall queries are answered by it, with no file or network involved

#### Scenario: Recorded queries
- **WHEN** any vector store is wrapped in `RecordingVector`
- **THEN** each query's filter, topK and hits (id, score, metadata) are available for inspection
