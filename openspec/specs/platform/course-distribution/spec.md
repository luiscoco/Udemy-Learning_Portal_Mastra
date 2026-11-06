# platform/course-distribution Specification

## Purpose

Provide students with a reproducible, sanitized local source distribution and a resource map that connects every released lesson to its learning materials.

## Requirements

### Requirement: Sanitized student distribution
The repository SHALL provide a bounded course ZIP command that includes the exact dependency lockfile, source, setup instructions, license and checksummed resource manifest. It MUST exclude credentials, private learner data, generated builds and test output, reject symbolic links or unsafe paths, and produce identical bytes for identical inputs. The command SHALL report failures without printing file contents or secrets.

#### Scenario: Build a student download
- **WHEN** the instructor builds the course ZIP from a workspace containing local credentials and learner data
- **THEN** the archive contains only allowlisted distribution files and a verifiable manifest, with no local private files

#### Scenario: Unsupported file or oversized distribution
- **WHEN** a selected source file is symbolic, unsafe or exceeds the bounded archive budget
- **THEN** packaging fails before publishing a partial archive

### Requirement: Complete course resource map
The student distribution SHALL map all 75 course labs and the orientation to stable workspace URLs, course modules and reference-source locations. Local setup instructions SHALL cover prerequisites, offline-first use, optional billed provider access, troubleshooting and updates. Hosted-service requirements SHALL be distinguished from local course requirements.

#### Scenario: Student finds a lecture resource
- **WHEN** a student looks up a released lab in the generated map
- **THEN** its title, module, stable local route and existing reference folder are available

#### Scenario: Fresh offline installation
- **WHEN** the student follows the guide with supported Node and npm versions and no provider credentials
- **THEN** locked dependencies install, the production build starts locally and the orientation can execute offline
