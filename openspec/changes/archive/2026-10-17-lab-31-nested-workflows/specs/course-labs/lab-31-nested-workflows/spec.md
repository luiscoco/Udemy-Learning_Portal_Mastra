## ADDED Requirements

### Requirement: Reusable verification subworkflow
Lab 31 SHALL nest a committed `verify-customer` workflow inside an order workflow and show its steps in the trace.

#### Scenario: Subworkflow trace visible
- **WHEN** the example orders run
- **THEN** each order's trace contains `verify-customer.checkIdentity`, `verify-customer.screenRisk` and `verify-customer.decide` between the start and the end of the `verify-customer` step, and each order's decision equals its `expectDecision`

#### Scenario: Reuse
- **WHEN** the same `verify-customer` workflow runs standalone on an order's verification input
- **THEN** its result equals the nested result

### Requirement: Schema boundaries maintained
Only the declared verification input SHALL cross into the subworkflow, and the subworkflow output SHALL be validated at the boundary.

#### Scenario: Whole order passed to a strict schema
- **WHEN** `boundaryFault` is `whole-order`
- **THEN** the subworkflow receives exactly the `VerificationInput` keys and the input-boundary check passes

#### Scenario: Loose schema
- **WHEN** `boundaryFault` is `loose-schema`
- **THEN** order fields leak into the subworkflow and the input-boundary check fails

#### Scenario: Malformed subworkflow output
- **WHEN** `boundaryFault` is `bad-output`
- **THEN** the output-boundary check fails and names `verify-customer` as the source
