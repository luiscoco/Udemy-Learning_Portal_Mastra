## ADDED Requirements

### Requirement: Complete outline titles
The catalog SHALL show the confirmed outline titles for all 75 labs and all 16 modules, without changing lab ids, order, routes or availability.

#### Scenario: Last lab
- **WHEN** the catalog is read
- **THEN** `lab-75` is titled "Enterprise AI Assistant capstone" in `module-15` "Production and Capstone", with `titleConfirmed: true`

#### Scenario: Nothing pending
- **WHEN** the catalog is read
- **THEN** no lab and no module is marked title pending
