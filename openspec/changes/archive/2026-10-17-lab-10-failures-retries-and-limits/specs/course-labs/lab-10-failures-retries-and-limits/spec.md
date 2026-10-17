## ADDED Requirements

### Requirement: Deterministic retry counts
With offline fault injection, Lab 10 SHALL produce exactly the expected attempts and waits for each scenario: persistent 503 → `maxAttempts` attempts with waits base, 2×base, 4×base…; 400 → one attempt; first-attempt timeout → two attempts; 429 with Retry-After → the wait equals Retry-After when larger.

#### Scenario: Persistent 503
- **WHEN** the scenario is always-unavailable with max attempts 4 and base 200 ms
- **THEN** there are exactly 4 attempts, waits 200, 400, 800 ms, and stop reason `max-attempts`

#### Scenario: Non-retryable
- **WHEN** the provider returns 400
- **THEN** there is exactly one attempt and stop reason `non-retryable`

### Requirement: Bounded failures
Retries SHALL stop at max attempts, when the next wait plus a full attempt would exceed the total budget, for non-idempotent work, and immediately on cancellation; total time SHALL stay within the budget.

#### Scenario: Budget
- **WHEN** waits would exceed a 1000 ms budget
- **THEN** retrying stops with reason `budget`

#### Scenario: Not idempotent
- **WHEN** the call is marked non-idempotent and the first attempt fails with 503
- **THEN** it is not retried and the stop reason is `not-idempotent`

### Requirement: Timeouts become retryable failures
An attempt exceeding the per-attempt timeout SHALL be recorded as a timed-out, retryable failure even though an aborted `agent.generate` resolves instead of rejecting.

#### Scenario: Slow first attempt
- **WHEN** the first attempt takes longer than the per-attempt timeout
- **THEN** attempt 1 is marked `timedOut` and retryable, and attempt 2 succeeds
