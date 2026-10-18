# course-labs/lab-35-business-process-capstone Specification

## Purpose
Lab 35 is the Module 07 capstone: a vendor due-diligence process (intake, parallel research, risk review, routed decision with a controlled human review, report) with every branch traced and tested and reviewer controls enforced inside the workflow.

## Requirements

### Requirement: End-to-end due-diligence process with trace
Lab 35 SHALL run intake → parallel research → risk review → branch (auto-approve, human review, block) → report, with every step visible in the trace.

#### Scenario: Every branch exercised
- **WHEN** the example batch runs (low, medium, high and sanctioned vendors)
- **THEN** the cases end `auto-approved`, `approved`, `rejected` and `blocked` respectively, each matching its `expectBranch`, and each trace contains intake, registryLookup, sanctionsScreen, mediaScan, riskReview, its branch step and report

### Requirement: Reviewer controls enforced
Human decisions SHALL be accepted only when they pass segregation of duties, authority for the risk level, and a rationale requirement.

#### Scenario: Self-approval refused
- **WHEN** the requester tries to approve their own medium-risk case
- **THEN** the attempt is refused with `SOD`, the run stays suspended, and a later valid manager approval is accepted

#### Scenario: Insufficient authority
- **WHEN** a manager decides a high-risk case
- **THEN** the attempt is refused with `AUTHORITY`, and only a senior's decision is accepted

#### Scenario: Controls disabled
- **WHEN** `controls` is `disabled`
- **THEN** the self-approval is accepted and the reviewer-controls check fails

#### Scenario: Attempts exhausted
- **WHEN** no valid decision arrives within the allowed attempts
- **THEN** the case ends `pending-review` and nothing is approved
