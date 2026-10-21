# course-labs/lab-62-tenant-isolation Specification

## Purpose
TBD - created by archiving change lab-62-tenant-isolation. Update Purpose after archive.

## Requirements

### Requirement: Tenant isolation lab
Lab 62 SHALL demonstrate why identifiers inside a shared store do not isolate tenants and how storage partitioning and run ownership do.

#### Scenario: Demonstration
- **WHEN** the example runs offline
- **THEN** in the shared store learner B reads learner A's thread (shown as the leak), in partitioned stores B reads nothing, A's run is refused to B, partition ids are hashes, and a traversal-looking owner id stays inside the tenants root
