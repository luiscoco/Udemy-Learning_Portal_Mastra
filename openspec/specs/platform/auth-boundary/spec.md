# platform/auth-boundary Specification

## Purpose

Protect the learning platform's Express API with verified learner sessions and run ownership, while refusing unsafe deployment of its development identity provider and keeping credentials server-side.

## Requirements

### Requirement: Authenticated lab execution
The API SHALL refuse to start, read, cancel or decide on a lab run without a valid session, and SHALL bind every run to the learner who started it.

#### Scenario: Anonymous run start
- **WHEN** a request without a session posts to `/api/labs/:labId/runs`
- **THEN** the response is 401 with code `UNAUTHORIZED`, and no run is created

#### Scenario: Another learner's run
- **WHEN** learner B requests learner A's run or its events
- **THEN** the response is 404, as for an unknown run

### Requirement: Development-safe login
The development identity provider SHALL accept only allowlisted users, SHALL run only on a loopback host, and SHALL be refused in production.

#### Scenario: Production configuration
- **WHEN** the API starts with `NODE_ENV=production` and the development provider
- **THEN** startup fails with a message naming the missing production identity provider

#### Scenario: Failed login
- **WHEN** an unknown user or a wrong passcode is submitted
- **THEN** the response is 401 with the same generic message in both cases, and repeated attempts are rate-limited (429)

### Requirement: Credentials not leaked
Session credentials SHALL travel only in an `HttpOnly`, `SameSite=Strict` cookie and SHALL never appear in response bodies or logs.

#### Scenario: Login response
- **WHEN** a login succeeds
- **THEN** the body contains the principal but not the session value, the cookie is `HttpOnly; SameSite=Strict; Path=/api`, and the logs contain neither the session value nor the passcode

#### Scenario: Tampered or revoked session
- **WHEN** the cookie signature is altered, the session expired, or the learner logged out
- **THEN** the request is treated as anonymous
