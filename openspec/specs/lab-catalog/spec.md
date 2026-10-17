# lab-catalog Specification

## Purpose
Browser-safe registry of course modules and labs shared by web and API.

## Requirements

### Requirement: Browser-safe catalog
The lab catalog SHALL be importable by both web and API without pulling server-only dependencies, and SHALL list course modules in fixed order with labs identified by `lab-XX` ids. Each lab SHALL be either `available` (implemented and runnable) or `locked` (preview only), and SHALL record whether its title is confirmed by the course outline.

#### Scenario: Dummy lab only
- **WHEN** the catalog is loaded
- **THEN** it contains lab `lab-00` titled "Dummy Lab 00", available, marked zero-cost and offline

#### Scenario: Only implemented labs are available
- **WHEN** the catalog is loaded
- **THEN** a lab is `available` only if the server registry implements it, and every other course lab (lab-01 to lab-75) is present as `locked`

#### Scenario: Unique ids
- **WHEN** the catalog is validated
- **THEN** all lab ids are unique and match the pattern `lab-NN` (two digits)

#### Scenario: Fixed module layout
- **WHEN** the catalog is loaded
- **THEN** it contains the orientation module (lab-00) followed by 15 course modules of five labs each, in numeric order

### Requirement: Outline titles through L53
The catalog SHALL show the confirmed outline titles for labs 01–53 and modules 00–11, and SHALL mark later labs and modules as title pending, without changing lab ids, order, routes or availability.

#### Scenario: Confirmed title
- **WHEN** the catalog is read
- **THEN** `lab-26` is titled "First typed workflow" in `module-06` "Workflow Foundations", with `titleConfirmed: true`

#### Scenario: Still pending
- **WHEN** the catalog is read
- **THEN** `lab-54` and `module-12` are marked title pending

### Requirement: Complete outline titles
The catalog SHALL show the confirmed outline titles for all 75 labs and all 16 modules, without changing lab ids, order, routes or availability.

#### Scenario: Last lab
- **WHEN** the catalog is read
- **THEN** `lab-75` is titled "Enterprise AI Assistant capstone" in `module-15` "Production and Capstone", with `titleConfirmed: true`

#### Scenario: Nothing pending
- **WHEN** the catalog is read
- **THEN** no lab and no module is marked title pending
