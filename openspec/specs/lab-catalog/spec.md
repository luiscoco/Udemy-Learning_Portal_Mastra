# lab-catalog Specification

## Purpose
TBD - created by archiving change f01-monorepo-foundation. Update Purpose after archive.

## Requirements

### Requirement: Browser-safe catalog
The lab catalog SHALL be importable by both web and API without pulling server-only dependencies, and SHALL list course modules in fixed order with labs identified by `lab-XX` ids.

#### Scenario: Dummy lab only
- **WHEN** the catalog is loaded in F01
- **THEN** it contains exactly one enabled lab with id `lab-00`, titled "Dummy Lab 00", marked zero-cost and offline

#### Scenario: Unique ids
- **WHEN** the catalog is validated
- **THEN** all lab ids are unique and match the pattern `lab-NN` (two digits)
