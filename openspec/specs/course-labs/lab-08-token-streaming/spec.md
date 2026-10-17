# course-labs/lab-08-token-streaming Specification

## Purpose
Lab 08: stream tokens with agent.stream over SSE, with cancellation, disconnect cleanup and a token budget.

## Requirements

### Requirement: Incremental token delivery
Lab 08 SHALL stream the answer with `agent.stream` and emit one `token` event per text delta as it arrives, so tokens reach the browser before the run completes, and the joined tokens SHALL equal the final text.

#### Scenario: Tokens before completion
- **WHEN** the lab runs offline with a 30 ms token delay
- **THEN** the first token event arrives well before the complete event and all checks pass

### Requirement: Cancellation and disconnect
Cancelling the run, reaching its deadline or the client disconnecting SHALL abort the model stream; no token events SHALL be emitted afterwards and the run SHALL end as cancelled (or timeout).

#### Scenario: Cancel mid-stream
- **WHEN** the learner cancels after three tokens
- **THEN** the run ends cancelled and no further token events appear

#### Scenario: Disconnect frees resources
- **WHEN** the only SSE subscriber disconnects mid-stream
- **THEN** the run is cancelled after the grace period and no active runs remain

### Requirement: Token budget
When "stop after N tokens" is set, the lab SHALL stop the stream itself after exactly N token events and report `finishReason` `budget`.

#### Scenario: Budget of five
- **WHEN** the budget is 5
- **THEN** exactly five token events are emitted and the clean-finish check passes
