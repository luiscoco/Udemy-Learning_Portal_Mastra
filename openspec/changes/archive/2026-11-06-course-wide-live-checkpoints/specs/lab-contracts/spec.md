# Spec Delta

## ADDED Requirements

### Requirement: Course-wide optional live scenarios
Every registered course lesson and orientation SHALL support offline and live execution. Offline MUST remain deterministic and free of provider calls. Lessons whose practical exercise needs no model SHALL offer an explicitly described provider-backed checkpoint rather than relabeling recorded data or fixtures as real external activity.

#### Scenario: Live selection in every lesson
- **WHEN** a learner opens any registered lesson's Run presentation
- **THEN** Live is supported by that lesson and its cost notice explains the real operation being requested

#### Scenario: Practical lesson checkpoint
- **WHEN** a learner selects Live in a scaffold, architecture, Studio, ingestion, chunking, protocol, security or client-integration lesson
- **THEN** the practical exercise runs and a real provider answers a lesson-specific question from bounded redacted result evidence, with distinct checkpoint events, model identity, usage and a structural completion check

#### Scenario: Provider unavailable or cancelled
- **WHEN** a checkpoint has no configured model, the provider fails, returns no answer or the learner cancels
- **THEN** it does not fabricate a successful model answer or silently substitute an offline model, and existing error/cancellation semantics apply

#### Scenario: Data and secret boundary
- **WHEN** a checkpoint sends result evidence to a provider
- **THEN** the learner's cost notice discloses that transfer, configured secrets are masked, context and generation are bounded, and neither credentials nor arbitrary code execution are exposed to the browser

#### Scenario: Existing offline callers
- **WHEN** an existing caller omits the new optional checkpoint model input and runs Offline
- **THEN** its existing output fields and objective checks remain compatible and no provider is called
