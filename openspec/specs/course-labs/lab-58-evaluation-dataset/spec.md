# course-labs/lab-58-evaluation-dataset Specification

## Purpose
TBD - created by archiving change lab-58-evaluation-dataset. Update Purpose after archive.

## Requirements

### Requirement: Versioned evaluation dataset
Lab 58 SHALL keep a Mastra dataset of scenarios (input and expected assertions) in durable storage, built from checked-in seed revisions applied idempotently, with each revision mapped to a dataset version.

#### Scenario: Seeding is idempotent
- **WHEN** the lab runs twice
- **THEN** the second run applies no seed operation, and the dataset version and items are unchanged

#### Scenario: Version pinning
- **WHEN** the runner is pinned to revision 1
- **THEN** the experiment runs on the dataset version of revision 1, with its three scenarios and the original `tool-validation` assertions

### Requirement: Runner without an external LLM
The runner SHALL execute an agent on every scenario with Mastra experiments and SHALL run offline on the mock provider.

#### Scenario: Offline run
- **WHEN** the latest revision runs offline
- **THEN** every scenario is answered by the scripted mock model (provider `mlp-offline`), scored by the rubric and assertions scorers, recorded as an experiment of that dataset version, and a second offline run of the same version gives the same per-item outcomes
