# course-labs/lab-61-authenticated-api Specification

## Purpose

Teach authentication and authorization through reproducible HTTP probes using the platform's shared authentication primitives, without provider calls or credentials appearing in learner-visible output.

## Requirements

### Requirement: Auth boundary lab
Lab 61 SHALL demonstrate the `@mlp/auth` boundary with real HTTP requests to a loopback server and SHALL check each defence.

#### Scenario: Demonstration
- **WHEN** the example runs offline
- **THEN** the anonymous request is refused (401), the dev login sets an `HttpOnly; SameSite=Strict` cookie, a tampered cookie and an expired session are refused, another user's run is not found, logout revokes the session, a production configuration with the dev provider is refused, and no response or log line contains the session value or the passcode
