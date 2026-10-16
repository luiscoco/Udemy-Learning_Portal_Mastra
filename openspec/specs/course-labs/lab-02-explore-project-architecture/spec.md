# course-labs/lab-02-explore-project-architecture Specification

## Purpose
Lab 02: map UI, API, runtime and Mastra entry of a real Mastra application with file assertions.

## Requirements

### Requirement: Architecture manifest
Lab 02 SHALL build a manifest of this repository containing workspaces, root scripts, per-layer evidence (dependencies, entry files, markers found), the Mastra entry's agent registration lines and environment hygiene facts (whether `.env` is gitignored, `.env.example` key names, client env prefix) without reading `.env` values.

#### Scenario: Manifest produced
- **WHEN** the lab runs with the example mapping
- **THEN** the result lists four layers with evidence and the root scripts `dev`, `build`, `test`

#### Scenario: Secrets never read
- **WHEN** a `.env` file exists
- **THEN** the manifest reports only its existence and gitignore status, never its contents

### Requirement: Mapping assertions
Each learner-selected path SHALL be graded by file assertions against the evidence for its layer, and a wrong mapping SHALL fail only that layer's check with a message naming the missing evidence.

#### Scenario: Wrong UI mapping
- **WHEN** the learner maps the UI layer to `apps/api`
- **THEN** the "UI layer" check fails explaining that no React dependency or `index.html` was found there

### Requirement: Allowlisted inspection
Inspection SHALL be limited to an allowlist of repository files resolved under the repository root; inputs are enumerations, not free paths.

#### Scenario: Free path rejected
- **WHEN** a request maps a layer to `../../etc`
- **THEN** the request fails with `VALIDATION_FAILED`
