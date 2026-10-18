## ADDED Requirements

### Requirement: Live output for non-streaming runs
The Run tab SHALL show a finished run's complete answer in Live output when the run streamed no tokens, and label it as not streamed.

#### Scenario: Lab that uses generate()
- **WHEN** a lab run finishes without token events and its result output has a non-empty `text` or `answer`
- **THEN** Live output shows that text with a note that it was returned in one piece

#### Scenario: Streaming lab
- **WHEN** a lab run emits token events
- **THEN** Live output shows the streamed tokens and not the complete-answer note
