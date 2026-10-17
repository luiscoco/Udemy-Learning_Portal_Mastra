## ADDED Requirements

### Requirement: Parse, enrich and render pipeline
Lab 27 SHALL run a Mastra workflow of sequential typed steps `parse → enrich → map → render` on a free-text invitation.

#### Scenario: Example
- **WHEN** the invitation "Team offsite on 2026-11-12 at 09:30 in Lisbon, room Atlas, organiser Ana" runs with reference date 2026-10-17
- **THEN** the result states Thursday, 26 days away, 09:30 Europe/Lisbon = 09:30 UTC, the Atlas venue address, and an .ics entry with `DTSTART:20261112T093000Z`

### Requirement: Ordered events
The run SHALL emit workflow-step events in pipeline order.

#### Scenario: Order
- **WHEN** the example runs
- **THEN** the trace is: the workflow running; parse, enrich, the mapping step and render, each running then success; and the workflow success

### Requirement: Typed transitions
Every transition SHALL satisfy the next step's input schema, and a transition that does not SHALL stop the run before the next step executes.

#### Scenario: Valid transitions
- **WHEN** the example runs
- **THEN** each recorded step output parses with the next step's input schema, and the final output parses with the workflow output schema

#### Scenario: Broken transition
- **WHEN** the broken-enrich toggle makes enrich return `daysUntil` as text
- **THEN** the run fails with `WORKFLOW_STEP_INPUT_VALIDATION_FAILED`, enrich is recorded as success, and render's execute never runs
