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
