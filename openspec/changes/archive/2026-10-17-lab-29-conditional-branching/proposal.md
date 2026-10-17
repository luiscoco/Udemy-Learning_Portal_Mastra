# Proposal

## Why

Workflows often choose a path from the data, for example routing a support ticket by severity. Mastra's `.branch()` behaves differently from what most learners expect:

- it evaluates **every** predicate and runs **every** matching branch;
- when nothing matches, the run "succeeds" with an empty result.

Learners need to see how to write mutually exclusive predicates, handle the unmatched path explicitly, and verify that each ticket took exactly one correct branch.

## What Changes

- **New lab `lab-29`** (Module 06): a `routing-workflow` that runs `assess → .branch([...]) → finalize` for each ticket in a learner-edited batch.
  - **`assess`** uses an agent with structured output to produce `{ severity: 0–4, reason }`, where 0 means it cannot assess.
  - **`.branch()`** routes from a table with mutually exclusive predicates:
    - `page-oncall` (4);
    - `priority-queue` (3);
    - `standard-queue` (1–2);
    - an explicit `manual-review` branch whose predicate is "no other route matches" (for example severity 0).
  - **`finalize`** receives the keyed branch output. It requires exactly one route and returns a typed routing record, or a typed problem: `UNROUTED` for an empty result, or `AMBIGUOUS_ROUTE` for more than one key.
- **Each ticket** declares `expectRoute`. The checks compare the route each ticket actually took, from the step records.
- **Contrast toggles:**
  - `overlapping`: `>=` thresholds without upper bounds, so several branches run for one ticket;
  - `noFallback`: no `manual-review` branch, so an unassessable ticket yields `{}` and `finalize` reports `UNROUTED`.

## Capabilities

### New Capabilities

- `course-labs/lab-29-conditional-branching`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-29/`. Offline is free. Live mode makes one model call per ticket (the assess step).
