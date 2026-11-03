# course-labs/lab-68-workflow-visualizer Specification

## Purpose
Define the Workflow visualizer lab (L68): draw a real Mastra workflow as a read-only DAG derived from its serializedStepGraph, colour each node live from the run's workflow-step events (skipped branches and unreached steps shown honestly), and hide workflows a role may not see without revealing that they exist.

## Requirements

### Requirement: Workflow graph with real statuses
Lab 68 SHALL emit the DAG of a real Mastra workflow before running it, stream live step statuses, and report every node's final status from Mastra's own step results.

#### Scenario: Branch not taken
- **WHEN** the order value selects auto-approval
- **THEN** the auto-approve node ends as success and the manager-review node as skipped

#### Scenario: Failing step
- **WHEN** the learner makes the fraud check fail
- **THEN** that node ends as failed and every downstream node as not reached

### Requirement: Inaccessible workflows hidden
A workflow the learner's role may not see SHALL be absent from the visible list, and requesting it SHALL return the same result as an id that does not exist, with no graph or step names.

#### Scenario: Learner requests a supervisor workflow
- **WHEN** a learner requests refund-override
- **THEN** the response matches the response for a nonexistent workflow id

### Requirement: A real model step in the visualized workflow
The order-fulfilment workflow SHALL include a native Mastra agent step that drafts the shipping email with the run's model (scripted offline, the learner's model live), shown as a graph node whose status, streamed tokens and model provenance come from the run.

#### Scenario: Live run
- **WHEN** the learner runs the workflow in live mode with a configured model
- **THEN** the emailWriter node succeeds, its draft streams token by token, mentions the tracking id, and the recorded provider is the real provider

#### Scenario: Agent step fails
- **WHEN** the learner makes emailWriter fail
- **THEN** the node shows failed, notifyCustomer is not reached, and no provider is called
