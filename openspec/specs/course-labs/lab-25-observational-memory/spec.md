# course-labs/lab-25-observational-memory Specification

## Purpose
Lab 25 teaches Mastra Observational Memory with evidence-based feature detection: native Observer observations when available, and an explicitly labelled app-level fallback otherwise.

## Requirements

### Requirement: Recorded capability probe
Lab 25 SHALL probe Observational Memory support in the installed packages and record each capability with its evidence in every run's output.

#### Scenario: Installed version
- **WHEN** the lab runs on `@mastra/memory` 1.38.0 with `@mastra/libsql`
- **THEN** the probe records the version check, the config option, the read API and storage support as available with evidence, and `nativeAvailable` is true

### Requirement: Native demonstration when available
When native Observational Memory is available and selected, the lab SHALL run it and show the stored observations, the observed messages, the token counts and the Observer calls, and the next answer SHALL use the observations.

#### Scenario: Threshold reached
- **WHEN** the example conversation passes the learner's `messageTokens` threshold with synchronous observation
- **THEN** the Observer runs, the stored observations include "allergic to peanuts", and the final answer mentions peanuts

### Requirement: Explicitly labelled fallback
The fallback SHALL be labelled `fallback (app-level, not Mastra observational memory)` and SHALL never be reported as native.

#### Scenario: Fallback selected
- **WHEN** the implementation is `fallback`
- **THEN** the output's `implementation` is `fallback` with that label, no native record is read, and the notes still let the final answer use the stated facts

#### Scenario: Native requested but unavailable
- **WHEN** `native` is requested and the probe reports it unavailable
- **THEN** the run fails with `NOT_CONFIGURED` and the probe evidence
