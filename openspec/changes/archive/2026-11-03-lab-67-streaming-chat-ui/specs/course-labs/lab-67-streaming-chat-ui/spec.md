## ADDED Requirements

### Requirement: Streaming chat turns on a persisted thread
Lab 67 SHALL stream each assistant reply token by token through Mastra memory on a learner-owned thread, and SHALL return the thread transcript after every turn.

#### Scenario: Send a message
- **WHEN** the learner sends a message on a thread
- **THEN** tokens arrive incrementally, the concatenated tokens equal the saved reply, and the thread ends with the user message and a complete reply

### Requirement: Stop and retry keep history honest
A stopped reply SHALL be kept and marked stopped, and retrying an unfinished turn SHALL replace it instead of adding the question a second time.

#### Scenario: Stop mid-stream, then retry
- **WHEN** the learner stops a reply after a few tokens and then retries
- **THEN** history shows the question once, followed by one complete reply, and no stopped partial remains

#### Scenario: Provider failure
- **WHEN** the model fails before any token
- **THEN** the turn is marked failed and a retry produces a complete reply
