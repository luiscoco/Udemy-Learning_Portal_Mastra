# course-labs/lab-73-deploy-application Specification

## Purpose
Define the Deploy application lab (L73): a deterministic release simulator with readiness-gated traffic, smoke tests and automatic rollback, and a live probe of the server-configured staging deployment over HTTPS.

## Requirements

### Requirement: Release simulator with health gates
Lab 73 SHALL simulate a release through build, push, new revision, readiness gate, traffic shift and post-deploy smoke test, never route traffic to a revision that is not ready, and roll back automatically when a release fails and automatic rollback is on.

#### Scenario: Release with a missing secret
- **WHEN** the learner releases a revision whose configuration lacks a required secret
- **THEN** the revision fails to start, traffic stays on the previous revision, and the result reports zero downtime and a rollback

#### Scenario: Healthy release
- **WHEN** the learner releases a healthy revision
- **THEN** the readiness gate passes, traffic moves to the new revision, and the post-deploy smoke test passes

### Requirement: Live staging probe
In live mode Lab 73 SHALL probe only the staging URL configured on the server, over HTTPS, for health, readiness and the first byte of a streamed response, and SHALL report NOT_CONFIGURED when no staging URL is set.

#### Scenario: No staging URL configured
- **WHEN** live mode runs without STAGING_URL on the server
- **THEN** the run fails with NOT_CONFIGURED and makes no network request
