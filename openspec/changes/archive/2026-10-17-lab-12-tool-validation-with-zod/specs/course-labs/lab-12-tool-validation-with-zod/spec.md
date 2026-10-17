## ADDED Requirements

### Requirement: Invalid input never executes
Tool arguments that fail the input schema SHALL be rejected by Mastra before `execute` runs; the lab SHALL prove that `execute` ran exactly once per accepted call and never for rejected ones.

#### Scenario: Invalid refund
- **WHEN** the arguments have a malformed order id, an amount above the limit and an unknown reason
- **THEN** `executeCalls` is 0 and the tool call finishes with a validation error

#### Scenario: Valid refund
- **WHEN** the arguments are valid
- **THEN** `executeCalls` is 1 and the output is an `accepted` ticket matching the output schema

### Requirement: Field-specific errors
Every invalid field SHALL be reported with its path and a human-readable message, both in the result and as one warning log per field.

#### Scenario: Exchange without sku and size
- **WHEN** action is exchange but sku and size are missing
- **THEN** the field errors list `sku` and `size`

### Requirement: Discriminated union
The `action` field SHALL select which fields are required; unknown actions SHALL be rejected.

#### Scenario: Unknown action
- **WHEN** action is `delete`
- **THEN** the call is rejected and nothing executes
