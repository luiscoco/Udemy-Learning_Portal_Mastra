# course-labs/lab-29-conditional-branching Specification

## Purpose
Lab 29 routes tickets with Mastra .branch() using mutually exclusive predicates, a derived manual-review fallback and explicit UNROUTED/AMBIGUOUS_ROUTE outcomes.

## Requirements

### Requirement: Severity routing through branch predicates
Lab 29 SHALL route each ticket through Mastra `.branch()` with mutually exclusive severity predicates.

#### Scenario: Every fixture follows the correct branch
- **WHEN** the example batch runs (severity 4, 3, 2 and an unassessable ticket)
- **THEN** each ticket's executed branch equals its `expectRoute` (`page-oncall`, `priority-queue`, `standard-queue`, `manual-review`), and exactly one branch runs per ticket

### Requirement: Unmatched path handled
A ticket that matches no severity route SHALL be routed to an explicit `manual-review` branch, never dropped.

#### Scenario: Unassessable ticket
- **WHEN** the assess step returns severity 0
- **THEN** the `manual-review` branch runs and the routing record says so

#### Scenario: No fallback configured
- **WHEN** the `noFallback` toggle removes the manual-review branch
- **THEN** Mastra returns an empty result for that ticket, `finalize` reports `UNROUTED`, and the routing check fails

### Requirement: Overlapping predicates detected
Overlapping predicates SHALL be detected as ambiguous routing.

#### Scenario: Overlapping toggle
- **WHEN** the `overlapping` toggle uses `>=` thresholds
- **THEN** a severity-4 ticket runs several branches, `finalize` reports `AMBIGUOUS_ROUTE`, and the exactly-one-branch check fails
