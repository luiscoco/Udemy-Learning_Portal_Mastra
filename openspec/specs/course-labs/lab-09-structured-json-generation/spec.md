# course-labs/lab-09-structured-json-generation Specification

## Purpose
Lab 09: typed structured output with Zod and graceful handling of malformed model JSON.

## Requirements

### Requirement: Validated typed output
Lab 09 SHALL request structured output with a Zod schema and return the typed object only after it passes the schema, re-validating it at the lab boundary.

#### Scenario: Valid reply
- **WHEN** the example runs offline
- **THEN** `result.object` passes `TicketSchema` and all checks pass

#### Scenario: Fenced JSON
- **WHEN** the model wraps valid JSON in a ```json fence
- **THEN** the object is still parsed and valid

### Requirement: Malformed replies never crash
Wrong-shape or broken JSON replies SHALL complete the run under every error strategy: `strict` reports the validation error code and field issues with no object, `warn` returns no object, `fallback` returns the configured fallback ticket; no invalid object is ever returned.

#### Scenario: Wrong shape with strict
- **WHEN** the reply has an invalid enum and wrong type and the strategy is strict
- **THEN** the run succeeds, `object` is null and the error code is `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`

#### Scenario: Wrong shape with fallback
- **WHEN** the strategy is fallback
- **THEN** `usedFallback` is true and the object is the fallback ticket
