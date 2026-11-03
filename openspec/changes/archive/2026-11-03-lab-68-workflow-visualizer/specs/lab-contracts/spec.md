## ADDED Requirements

### Requirement: Workflow graph event
The execution event contract SHALL include a workflow-graph event carrying a layered DAG of nodes and edges, so clients can draw a workflow before and while it runs.

#### Scenario: Existing clients
- **WHEN** a run never emits workflow-graph
- **THEN** every existing event and client behaves unchanged
