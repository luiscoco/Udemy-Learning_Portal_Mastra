# course-labs/lab-07-behavior-and-instruction-variants Specification

## Purpose
Lab 07: controlled comparison of two instruction variants with config-linked outputs and saved comparisons.

## Requirements

### Requirement: Controlled variant comparison
Lab 07 SHALL run the same prompt with the same model and settings under two instruction variants and show both outputs side by side, each linked to its configuration by a stable `configHash`.

#### Scenario: Outputs linked to configs
- **WHEN** the example input runs offline
- **THEN** the result contains two variants, each with label, instructions hash, settings, `configHash` and output, and all checks pass

#### Scenario: Identical settings verified
- **WHEN** the lab runs offline
- **THEN** a check confirms both model calls received the same user prompt and model id and differed only in the system prompt

### Requirement: Variants must differ
Identical instructions in both variants SHALL complete the run but fail the "variants differ" check with a message asking the learner to change one variant.

#### Scenario: Same instructions
- **WHEN** both variants have identical instructions
- **THEN** the run completes and the "variants differ" check fails

### Requirement: Saved comparisons
Each run SHALL save its comparison record to the server data directory, keep only the newest 20, and report the saved id plus the recent saved comparisons.

#### Scenario: Comparison saved
- **WHEN** a run completes
- **THEN** a JSON record with the run's id exists under `comparisons/` and appears in the recent list
