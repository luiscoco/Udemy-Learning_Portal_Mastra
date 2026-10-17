## ADDED Requirements

### Requirement: Typed workflow with one step
Lab 26 SHALL define a Mastra workflow with Zod input and output schemas and a single typed step, and run it from the learner's input.

#### Scenario: Expected typed output
- **WHEN** the example order "2 mugs and 3 caps, discount code WELCOME10" runs in EUR
- **THEN** the workflow status is `success`, the step path is `["extract-and-price"]`, and the result passes the output schema with subtotal, discount and total computed from the catalog

### Requirement: Input validated before any step
Invalid workflow input SHALL be rejected by Mastra before any step runs.

#### Scenario: Probe
- **WHEN** the lab starts a second run with an empty email and an unsupported currency
- **THEN** Mastra throws "Invalid input data" naming both fields, and no step event is emitted for that run

### Requirement: Output validated by the app
Because Mastra does not validate workflow output at runtime, the lab SHALL validate the final result against the workflow's output schema and report violations.

#### Scenario: Buggy step
- **WHEN** the buggy-step toggle makes the step return the total as a string
- **THEN** Mastra reports `success`, the wrapper reports `outputValid: false` with the `total` issue, and the `output-typed` check fails

### Requirement: Lifecycle trace
The run SHALL emit workflow-step events for the workflow start, the step start and result, and the finish, in order.

#### Scenario: Trace
- **WHEN** the example runs
- **THEN** the trace contains `quote-workflow` running, `extract-and-price` running then success, and `quote-workflow` success
