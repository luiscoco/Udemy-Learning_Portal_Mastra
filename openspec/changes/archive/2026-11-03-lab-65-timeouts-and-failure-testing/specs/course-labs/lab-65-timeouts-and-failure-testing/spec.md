## ADDED Requirements

### Requirement: Bounded retries and enforced timeouts
Every model and tool call in the lab SHALL run with a per-attempt timeout that aborts the attempt and a bounded number of attempts, retrying only retryable failures.

#### Scenario: Primary model outage
- **WHEN** the primary model returns HTTP 503 on every attempt
- **THEN** it is attempted at most the configured number of times, and the fallback model answers without extra hidden retries

#### Scenario: Rejected key
- **WHEN** the primary model returns HTTP 401
- **THEN** it is attempted exactly once before the fallback answers

### Requirement: Failing dependency isolated
A dependency that keeps failing SHALL open its circuit breaker, later calls SHALL be short-circuited without attempts, and the agent SHALL still answer every question with the remaining dependencies, stating what is degraded.

#### Scenario: Recommendations service down
- **WHEN** getRecommendations fails on every call
- **THEN** its breaker opens, later calls are short-circuited, and every question still gets an answer

### Requirement: No hung run
Every call SHALL end with a terminal outcome, the run SHALL finish within a computed bound, and cancelling a question SHALL abort its in-flight calls without affecting later questions.

#### Scenario: Customer closes the chat during a slow call
- **WHEN** a question is cancelled while its tracker call hangs
- **THEN** the call ends as cancelled promptly, no further attempts start for that question, and the next questions are answered
