## ADDED Requirements

### Requirement: Health endpoint
The API SHALL expose `GET /api/health` returning HTTP 200 with JSON `{ status: "ok", service, version, uptimeSeconds, mode, mastraVersion, timestamp }` validated by a shared schema.

#### Scenario: Healthy response
- **WHEN** a client requests `GET /api/health`
- **THEN** the response status is 200 and the body matches the shared health schema with `status` equal to `"ok"`

#### Scenario: No secrets in health
- **WHEN** a provider API key is configured
- **THEN** the health body does not contain the key value

### Requirement: Unknown API routes
The API SHALL respond to unknown `/api/*` routes with HTTP 404 and a JSON error body `{ error: { code: "NOT_FOUND", message } }`.

#### Scenario: Unknown route
- **WHEN** a client requests `GET /api/does-not-exist`
- **THEN** the response is 404 with error code `NOT_FOUND`
