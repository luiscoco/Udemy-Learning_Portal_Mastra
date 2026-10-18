# course-labs/lab-24-semantic-recall Specification

## Purpose
Lab 24 teaches Mastra semantic recall: messages embedded into a vector store and older relevant messages recalled by meaning across a user's threads, with a stubbable vector service.

## Requirements

### Requirement: Relevant older fact recalled by meaning
Lab 24 SHALL store an earlier conversation with embeddings and, for a question asked in a new thread, recall the semantically relevant older message through Mastra semantic recall.

#### Scenario: Example
- **WHEN** the history contains "I'm allergic to peanuts." among unrelated facts, `lastMessages` is 2, and the user asks "What should I avoid eating at the team dinner?" in a new thread
- **THEN** the recorded vector query for the question returns "I'm allergic to peanuts." among at most topK hits, and the answer mentions peanuts

### Requirement: Recall is scoped to the user
Semantic recall SHALL only return the asking user's messages.

#### Scenario: Another user's similar fact
- **WHEN** another user has said "I'm allergic to shellfish."
- **THEN** no recall hit belongs to that user and the answer does not mention shellfish

### Requirement: Testable with a stubbed vector service
The lab SHALL run unchanged against the in-memory stub vector store.

#### Scenario: Stub backend
- **WHEN** the vector backend is `in-memory`
- **THEN** the same fact is recalled and the stub's recorded query shows the user filter and topK

### Requirement: Configuration contrasts
Disabling recall, or recalling with thread scope in a new thread, SHALL NOT recall the fact, and the lab SHALL report this as failed checks.

#### Scenario: Recall disabled
- **WHEN** semantic recall is disabled
- **THEN** no vector query is made for the question and the `older-fact-recalled` check fails

### Requirement: Reliable recall under concurrent runs
Concurrent L24 runs SHALL each recall their own older fact when they share the libSQL vector file.

#### Scenario: Waves of concurrent runs
- **WHEN** three waves of 8 L24 runs start at the same time on one vector file
- **THEN** every run passes its checks, and each run removes the vectors it wrote when it finishes
