## ADDED Requirements

### Requirement: Offline mock
With the mock data source, Lab 14 SHALL answer from recorded Open-Meteo-shaped data without any network access.

#### Scenario: Example offline
- **WHEN** the example runs with the mock data source
- **THEN** two allowlisted requests are recorded with status 200 and the answer quotes the mocked temperatures

### Requirement: Failures and rate limits handled
Timeouts, upstream 429 and 5xx responses, malformed bodies and local rate-limit refusals SHALL be returned as typed, schema-valid error results; the run SHALL complete and the answer SHALL explain the failure.

#### Scenario: Timeout
- **WHEN** the mock hangs and the timeout is 300 ms
- **THEN** each city reports `TIMEOUT` within about the timeout

#### Scenario: Upstream 429
- **WHEN** the mock returns 429 with Retry-After 30
- **THEN** the result is `RATE_LIMITED`, retryable, with `retryAfterSeconds` 30

#### Scenario: Local rate limit
- **WHEN** the limit is 1 request per minute and three cities are requested
- **THEN** one request is made and the other two are refused locally as `RATE_LIMITED`

### Requirement: Allowlisted, server-built requests
Requests SHALL only target allowlisted hosts and SHALL be built from server-side data; the model SHALL NOT supply URLs.

#### Scenario: Allowlist
- **WHEN** any request is made
- **THEN** its host is `api.open-meteo.com`
