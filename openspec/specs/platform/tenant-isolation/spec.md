# platform/tenant-isolation Specification

## Purpose
Keep every learner's stored data (threads, document libraries, saved files, datasets, workflow snapshots and browser-stored progress) in a partition derived from their authenticated identity, classify every API route as public or tenant-scoped, and migrate legacy shared data only explicitly.

## Requirements

### Requirement: Storage partitioned per tenant
Every durable store a lab uses SHALL live in a partition derived from the run owner's identity, so learners never share a store file, folder or record.

#### Scenario: Same lab, two learners
- **WHEN** learners A and B run the same memory, document, dataset or comparison lab
- **THEN** B's run reads none of A's threads, documents, dataset experiments or saved files

#### Scenario: Hostile owner id
- **WHEN** an owner id contains path separators or `..`
- **THEN** its partition is a fixed-length hash inside the tenants root, and no path is built from the raw id

### Requirement: Every API route classified and tested
Every registered API route SHALL be classified as public or tenant-scoped, and every tenant-scoped route SHALL refuse anonymous callers and other tenants.

#### Scenario: Unclassified route
- **WHEN** a new API route is registered without a classification
- **THEN** the route audit test fails

#### Scenario: Cross-tenant access
- **WHEN** learner B calls any tenant route with learner A's run id
- **THEN** the response is 404, while the same call by A succeeds, and an anonymous caller gets 401

### Requirement: Explicit migration of legacy shared data
Legacy shared stores SHALL NOT become visible to any learner automatically, and a migration script SHALL copy them, including the sidecar `.jsonl` records that belong to a store, into one chosen owner's partition without overwriting.

#### Scenario: Migration
- **WHEN** the script runs with `--owner dev:learner`
- **THEN** the legacy files are copied into that owner's partition, existing partition files are not overwritten, and the source stays untouched unless `--move` is given

#### Scenario: Workflow store with its ledger
- **WHEN** the legacy memory folder holds `lab-32-workflows.db` and `lab-32-ledger.jsonl`
- **THEN** both are copied into the owner's partition, so a resumed workflow still sees its recorded side effects
