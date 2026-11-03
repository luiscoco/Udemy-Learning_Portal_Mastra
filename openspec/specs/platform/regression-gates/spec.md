# platform/regression-gates Specification

## Purpose
Define the release gates that decide whether a build may ship: security, load-smoke, eval-regression, tracing, workflow-recovery and accessibility, each with version-controlled thresholds and baselines, measured for real by npm run regression with evidence recorded per commit and in CI.

## Requirements

### Requirement: Documented release gates
The repository SHALL define security, load-smoke, eval-regression, tracing, workflow-recovery and accessibility gates with explicit thresholds and baselines in version-controlled files, and a regression command SHALL measure each gate for real, record evidence with the commit, and exit with a failure status when any gate fails.

#### Scenario: Injected regression
- **WHEN** the regression command runs with a regression injected into one gate
- **THEN** that gate fails, the evidence names the injection, and the command exits with a failure status

#### Scenario: Unlisted vulnerability
- **WHEN** a production dependency has a high or critical advisory that is not on the allowlist, or an allowlist entry has expired
- **THEN** the security gate fails and names the advisory

### Requirement: Recorded evidence
Each regression run SHALL record per-gate metrics, thresholds, findings and durations together with the commit and time, both locally and as a CI artifact.

#### Scenario: CI run
- **WHEN** CI runs the regression job on a push
- **THEN** the job fails on any failing gate and uploads the evidence file
