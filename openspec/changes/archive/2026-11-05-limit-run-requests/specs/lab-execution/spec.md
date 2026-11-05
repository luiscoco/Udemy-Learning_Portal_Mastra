## ADDED Requirements

### Requirement: Bounded run request admission
The API SHALL enforce configured per-learner and per-client-network limits for run starts and, separately, approval decisions plus capability recovery. Refused requests SHALL return retryable TOO_MANY_REQUESTS with HTTP 429, Retry-After and an accessible wait message, before executing the requested action. Rejection SHALL NOT extend the wait or consume an otherwise available allowance.

#### Scenario: Learner exceeds run allowance
- **WHEN** an authenticated learner exceeds the start allowance across labs or sessions
- **THEN** no new run starts, the response is 429 with retry guidance, and admission becomes available after the indicated window

#### Scenario: Shared client network exceeds allowance
- **WHEN** multiple learners exhaust their shared client network's allowance
- **THEN** further requests in that family are refused even if the individual learner has remaining allowance

#### Scenario: Control allowance is exhausted
- **WHEN** a learner exhausts the shared approval/recovery allowance
- **THEN** a further approval or recovery is refused without settling the pending approval or issuing another capability

### Requirement: Safe bounded request accounting
Request accounting SHALL preserve existing authentication and ownership checks, derive identities from verified sessions and the configured proxy trust boundary, group IPv6 clients by /64, and bound retained state without evicting active allowances. Cancellation, reads and event replay SHALL remain available independently of these request limits. Expired state SHALL be reclaimed; full active accounting capacity SHALL fail closed with retry guidance.

#### Scenario: Cancellation while throttled
- **WHEN** the owner cancels a live run with its valid capability after exhausting request allowances
- **THEN** cancellation succeeds and its terminal events remain readable

#### Scenario: Wrong owner or anonymous caller
- **WHEN** a non-owner or anonymous caller requests a protected run action
- **THEN** existing 404 or 401 behavior is preserved and no victim's learner allowance is consumed

#### Scenario: Forwarding header without a trusted proxy
- **WHEN** a direct client changes X-Forwarded-For while proxy trust is disabled
- **THEN** those requests share the socket client's allowance

#### Scenario: Accounting capacity is full
- **WHEN** all retained accounting entries are active and a request needs another entry
- **THEN** the request is refused with retry guidance without erasing any existing allowance
