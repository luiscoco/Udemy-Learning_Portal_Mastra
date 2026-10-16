# lab-catalog Specification

## Purpose
Browser-safe registry of course modules and labs shared by web and API.

## Requirements

### Requirement: Browser-safe catalog
The lab catalog SHALL be importable by both web and API without pulling server-only dependencies, and SHALL list course modules in fixed order with labs identified by `lab-XX` ids.

#### Scenario: Dummy lab only
- **WHEN** the catalog is loaded in F01
- **THEN** it contains exactly one enabled lab with id `lab-00`, titled "Dummy Lab 00", marked zero-cost and offline

#### Scenario: Unique ids
- **WHEN** the catalog is validated
- **THEN** all lab ids are unique and match the pattern `lab-NN` (two digits)
