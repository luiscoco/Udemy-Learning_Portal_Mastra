# course-labs/lab-33-human-approval Specification

## Purpose
Lab 33 gates a simulated refund behind a persisted supervisor approval with a deadline: approve pays exactly once despite retries, reject and expiry never pay, and duplicate or late approvals are rejected.

## Requirements

### Requirement: Durable supervisor approval gate
Lab 33 SHALL gate a simulated refund behind a persisted supervisor approval with approve, reject and expiration outcomes.

#### Scenario: Gate before payment
- **WHEN** refund requests start
- **THEN** each suspends at `supervisorApproval` with an `expiresAt`, no payment exists, and a fresh Mastra instance lists the runs as suspended

#### Scenario: Reject and timeout never pay
- **WHEN** a supervisor rejects a request, or nobody decides before the expiry sweep
- **THEN** the request ends `rejected` or `expired` and the payment ledger has no entry for it

#### Scenario: Late approval
- **WHEN** an approval arrives for an expired request
- **THEN** it is rejected and no payment is made

### Requirement: Idempotent approved path
An approved refund SHALL be paid exactly once, including after transient provider failures and duplicate approvals.

#### Scenario: Lost acknowledgement retried
- **WHEN** the provider records the refund but the acknowledgement is lost and Mastra retries `settle`
- **THEN** the idempotency key replays the same payment and the ledger shows one payment

#### Scenario: Duplicate approval
- **WHEN** an approved, completed request is approved again
- **THEN** the resume is rejected and the payment count is unchanged

#### Scenario: No idempotency key
- **WHEN** `idempotency` is `none` and an acknowledgement is lost
- **THEN** a second payment is recorded and the refunded-once check fails
