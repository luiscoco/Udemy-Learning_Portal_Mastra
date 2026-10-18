## ADDED Requirements

### Requirement: Comparable chunking configurations
Lab 37 SHALL chunk the selected documents with each configured strategy, size and overlap using `@mastra/rag`, and report comparable statistics in characters and tokens.

#### Scenario: Side-by-side comparison
- **WHEN** the example runs character, recursive and token configurations over the built-in documents
- **THEN** each configuration reports its chunk count, size statistics, overlap and coverage, and every chunk is within its `maxSize`

### Requirement: Traceable chunk previews
Every chunk preview SHALL show its source document and verified start and end offsets.

#### Scenario: Offsets verified
- **WHEN** a chunk is returned
- **THEN** `source.slice(start, end)` equals the chunk text, and the offset is labelled `mastra` or `relocated`

#### Scenario: Token chunks with unreliable start index
- **WHEN** Mastra reports `startIndex: -1` for an overlapping token chunk
- **THEN** the chunk is relocated in the source and remains traceable

### Requirement: No empty chunks
Empty or degenerate chunks SHALL be removed and reported.

#### Scenario: Sentence fragment
- **WHEN** a strategy produces a chunk with no letters or digits (for example a lone ".")
- **THEN** it is not part of the output chunks and appears under `dropped` with its strategy
