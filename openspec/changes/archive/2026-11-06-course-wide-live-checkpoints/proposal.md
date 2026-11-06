# Proposal

## Why

Thirteen lessons including orientation expose a disabled Live control because they declare only offline execution. The operator has provider keys but the local server remains in offline mode. Learners need an honest optional live scenario in every lesson.

## What Changes

- Add a lesson-specific real-provider checkpoint after the existing practical exercise in labs 00, 01, 02, 05, 36, 37, 46–49, 61, 62 and 66.
- Preserve deterministic offline behavior and the existing live implementations in all other lessons.
- Declare optional live-model selection, cost/data notices, readable shared source, events and objective checks for checkpoints.
- Enable the user's local server for live requests without changing the committed offline defaults or exposing credentials.
- Verify all 76 entries advertise supported live execution, test failure/cancellation and run provider-backed evidence for the newly added paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-contracts`: course-wide optional live scenarios and transparent checkpoint semantics.

## Impact

Thirteen existing lab definitions and run adapters, shared server-only checkpoint implementation, documentation and tests. Additive optional input/output fields; existing IDs, reference exercises and API routes stay stable. No SDK upgrades or new dependencies.
