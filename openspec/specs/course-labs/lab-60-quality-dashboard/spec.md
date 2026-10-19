# course-labs/lab-60-quality-dashboard Specification

## Purpose
TBD - created by archiving change lab-60-quality-dashboard. Update Purpose after archive.

## Requirements

### Requirement: Quality dashboard from stored runs
Lab 60 SHALL derive the eval pass rate, regressions and latency percentiles of a dataset's runs from the stored experiments, scores and results, and SHALL link each latest-run item to its stored trace.

#### Scenario: Regression between two runs
- **WHEN** a grounded run is recorded and then a no-tools run is recorded offline
- **THEN** the history shows both runs with their pass rates, the KPI delta equals the latest pass rate minus the previous one, the scenarios that passed with grounded and fail with no-tools are listed as regressions, and each links to a trace read back from storage

#### Scenario: Latency percentiles
- **WHEN** a run is shown
- **THEN** its p50, p95 and p99 are nearest-rank percentiles of the stored item durations, with p50 ≤ p95 ≤ p99

### Requirement: Usable empty states
The dashboard SHALL render without errors and with guidance when there is no data.

#### Scenario: No runs yet
- **WHEN** the dashboard is shown on a store without experiments
- **THEN** it reports an empty state with a reason and the next action, every KPI is null, and no number is invented

#### Scenario: One run
- **WHEN** exactly one run exists
- **THEN** the pass rate and latency are shown, and the regressions say they need two runs
