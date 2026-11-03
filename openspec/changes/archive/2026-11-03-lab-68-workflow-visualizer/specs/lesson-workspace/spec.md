## ADDED Requirements

### Requirement: Live workflow visualizer in the Run tab
When a run emits a workflow graph, the Run tab SHALL render it read-only with each node's live status from the run's workflow-step events, and an accessible list of the same steps and statuses.

#### Scenario: Step finishes
- **WHEN** a workflow-step success event arrives for a node
- **THEN** that node shows Done, and nodes that never ran show Skipped or Not reached once the run has finished
