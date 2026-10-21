## MODIFIED Requirements

### Requirement: Explicit migration of legacy shared data
Legacy shared stores SHALL NOT become visible to any learner automatically, and a migration script SHALL copy them, including the sidecar `.jsonl` records that belong to a store, into one chosen owner's partition without overwriting.

#### Scenario: Migration
- **WHEN** the script runs with `--owner dev:learner`
- **THEN** the legacy files are copied into that owner's partition, existing partition files are not overwritten, and the source stays untouched unless `--move` is given

#### Scenario: Workflow store with its ledger
- **WHEN** the legacy memory folder holds `lab-32-workflows.db` and `lab-32-ledger.jsonl`
- **THEN** both are copied into the owner's partition, so a resumed workflow still sees its recorded side effects
