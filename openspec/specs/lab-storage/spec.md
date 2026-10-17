# lab-storage Specification

## Purpose
Lab 21 teaches durable conversation memory: Mastra Memory on a LibSQL store, threads named per call, chronological recall, the lastMessages window, and history that survives a restart.

## Requirements

### Requirement: Durable lab storage
The platform SHALL provide labs with durable Mastra storage through `services.memory.open(name, options)`, backed by a local LibSQL file at `<dataDir>/memory/<name>.db`, returning a `Memory` instance and a `close()` function; names SHALL be validated slugs.

#### Scenario: Open and reopen
- **WHEN** a lab opens `lab-21`, writes messages, closes, and opens `lab-21` again
- **THEN** the second instance reads the messages written by the first

#### Scenario: Invalid name
- **WHEN** a lab opens a name containing a path separator
- **THEN** the call fails without creating any file

### Requirement: Survives process restart
Data written by one process SHALL be readable by a new process using the same database file.

#### Scenario: Two processes
- **WHEN** process 1 sends two messages into thread `t1` and exits, and process 2 then opens the same file
- **THEN** process 2 recalls both user messages in chronological order and its next agent turn receives them as history

### Requirement: Vector stores and embedders for memory
The platform SHALL let labs open durable memory with a vector store and an embedder, provide a durable LibSQL vector store per name, an in-memory stub vector store for tests, a recording decorator that captures every upsert and query, and a deterministic offline embedder labelled as a stand-in.

#### Scenario: Stubbed vector service
- **WHEN** a test opens memory with `InMemoryVector` and semantic recall enabled
- **THEN** messages are upserted into the stub and recall queries are answered by it, with no file or network involved

#### Scenario: Recorded queries
- **WHEN** any vector store is wrapped in `RecordingVector`
- **THEN** each query's filter, topK and hits (id, score, metadata) are available for inspection
