## ADDED Requirements

### Requirement: Crash recovery without duplicate operations
Lab 34 SHALL recover an interrupted billing run from persisted workflow state and charge each invoice exactly once.

#### Scenario: Crash after a charge is recorded
- **WHEN** the worker crashes right after the provider records the charge for the `crashAfter` invoice
- **THEN** a fresh Mastra instance finds the run `running`, `restart()` completes it without re-running earlier charge steps, the crashed step's charge is replayed by its idempotency key, and the ledger shows one charge per invoice

#### Scenario: Real process crash
- **WHEN** a worker process exits mid-step and a second process restarts the run
- **THEN** every invoice has exactly one charge and the run succeeds

#### Scenario: No idempotency key
- **WHEN** `idempotency` is `none`
- **THEN** the restarted step charges the crashed invoice twice and the no-duplicate check fails

### Requirement: Transient failures retried with state kept
Transient provider failures SHALL be retried by Mastra, and progress SHALL be kept in workflow state.

#### Scenario: Flaky provider
- **WHEN** an invoice's charge fails with 503 `failTimes` times
- **THEN** the step succeeds after `failTimes + 1` attempts with one charge, and the workflow state lists every charged invoice and the total
