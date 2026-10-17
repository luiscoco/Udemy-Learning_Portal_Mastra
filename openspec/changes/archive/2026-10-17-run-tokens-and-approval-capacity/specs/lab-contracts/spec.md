## MODIFIED Requirements

### Requirement: Canonical API errors
Every API error SHALL use the `ApiError` envelope with a canonical code, a human message free of secrets, an optional `retryable` flag, optional field-level `details` and the request id. The canonical codes SHALL include `FORBIDDEN` (HTTP 403) for requests that lack the credential an operation requires.

#### Scenario: Field details
- **WHEN** an execution request fails input validation
- **THEN** the error code is `VALIDATION_FAILED` and `details` lists each failing input path

#### Scenario: Forbidden
- **WHEN** a run is cancelled without its run token
- **THEN** the response is 403 with code `FORBIDDEN`
