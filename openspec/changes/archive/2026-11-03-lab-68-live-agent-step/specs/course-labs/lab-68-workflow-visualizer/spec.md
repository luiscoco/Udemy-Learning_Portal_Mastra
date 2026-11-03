## ADDED Requirements

### Requirement: A real model step in the visualized workflow
The order-fulfilment workflow SHALL include a native Mastra agent step that drafts the shipping email with the run's model (scripted offline, the learner's model live), shown as a graph node whose status, streamed tokens and model provenance come from the run.

#### Scenario: Live run
- **WHEN** the learner runs the workflow in live mode with a configured model
- **THEN** the emailWriter node succeeds, its draft streams token by token, mentions the tracking id, and the recorded provider is the real provider

#### Scenario: Agent step fails
- **WHEN** the learner makes emailWriter fail
- **THEN** the node shows failed, notifyCustomer is not reached, and no provider is called
