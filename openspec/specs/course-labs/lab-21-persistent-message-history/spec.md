# course-labs/lab-21-persistent-message-history Specification

## Purpose
Lab 21 teaches durable conversation memory: Mastra Memory on a LibSQL store, threads named per call, chronological recall, the lastMessages window, and history that survives a restart.

## Requirements

### Requirement: Conversation survives a restart
Lab 21 SHALL store a conversation in a named thread with durable Mastra memory, discard every Mastra instance, reopen the store and answer a follow-up from the persisted history.

#### Scenario: Example
- **WHEN** the example sends "Hi, I'm Ana and I'm planning a trip to Porto." and "I prefer trains to planes.", restarts, and asks for the learner's name and travel preference
- **THEN** the recalled history after the restart contains both messages, and the answer mentions Ana and trains

### Requirement: Chronological history inspection
The lab SHALL show the thread's messages from `memory.recall()` in chronological order with role and timestamp.

#### Scenario: Order
- **WHEN** the history is inspected after the follow-up
- **THEN** messages alternate user and assistant in the order sent, and timestamps never decrease

### Requirement: Context window and reset
The lab SHALL honour `lastMessages` and SHALL support starting a fresh thread.

#### Scenario: Small window
- **WHEN** `lastMessages` is 2
- **THEN** the follow-up's model call receives at most 2 prior messages and the remembered-facts check fails

#### Scenario: Accumulating runs
- **WHEN** the lab runs twice with reset off
- **THEN** the second run's recalled history also contains the first run's messages
