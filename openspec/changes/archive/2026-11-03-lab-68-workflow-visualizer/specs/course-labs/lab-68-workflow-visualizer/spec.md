## ADDED Requirements

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
