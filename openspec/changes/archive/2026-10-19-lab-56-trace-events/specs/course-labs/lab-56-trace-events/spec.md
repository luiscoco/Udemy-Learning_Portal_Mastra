## ADDED Requirements

### Requirement: Mastra execution traced with the observability adapter
Lab 56 SHALL trace a workflow run with three agents through `@mastra/observability` and an in-process exporter, and SHALL show the spans in the Run tab as a tree.

#### Scenario: Coherent trace
- **WHEN** the example runs offline
- **THEN** every started span ends; all spans share the run's trace id and have exactly one root (the workflow run); each step span's parent is the workflow run or the parallel span; each agent run is the child of the step that called it; each tool call is under its agent's model step; and every span carries the lab's correlation id

### Requirement: Faults are attributed
The lab SHALL attribute a tool failure to its tool span and SHALL detect agent work that produced no spans.

#### Scenario: Tool error
- **WHEN** the fault is `tool-error`
- **THEN** exactly the failing `tool_call` span has an error with the message and without a stack trace, and the run still succeeds

#### Scenario: Detached agent
- **WHEN** the fault is `detached-agent`
- **THEN** the review step has no agent span, and the lab reports the untraced agent call
