## ADDED Requirements

### Requirement: Chat presentation in the Run tab
For labs whose definition sets presentation to chat, the Run tab SHALL show a chat panel with thread history, a live streaming bubble, a Stop control that responds immediately, and Retry on a stopped or failed last turn.

#### Scenario: Stop while tokens stream
- **WHEN** the learner presses Stop during a streaming reply
- **THEN** the panel shows that it is stopping at once, the run is cancelled with its run token, and the partial reply appears as stopped within a second

#### Scenario: No duplicated tokens after a reconnect
- **WHEN** the event stream reconnects and the server replays events the panel already showed
- **THEN** each token appears once in the streaming bubble
