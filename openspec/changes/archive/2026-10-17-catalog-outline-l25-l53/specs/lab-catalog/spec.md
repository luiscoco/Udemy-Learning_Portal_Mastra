## ADDED Requirements

### Requirement: Outline titles through L53
The catalog SHALL show the confirmed outline titles for labs 01–53 and modules 00–11, and SHALL mark later labs and modules as title pending, without changing lab ids, order, routes or availability.

#### Scenario: Confirmed title
- **WHEN** the catalog is read
- **THEN** `lab-26` is titled "First typed workflow" in `module-06` "Workflow Foundations", with `titleConfirmed: true`

#### Scenario: Still pending
- **WHEN** the catalog is read
- **THEN** `lab-54` and `module-12` are marked title pending
