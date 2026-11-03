# client-sdk Specification

## Purpose
Give every client of the platform API one typed, browser-safe SDK (@mlp/client): a method per registered route, contract-validated responses with CONTRACT errors on drift, typed API errors, resumable run event streams, and no credentials beyond the session cookie and per-run token.

## Requirements

### Requirement: Typed client SDK for every API route
The platform SHALL provide a browser-safe client SDK with a typed method for every registered API route, validating every success response against its contract schema and turning error bodies into typed errors.

#### Scenario: Contract drift
- **WHEN** the API returns a response that does not match its contract schema
- **THEN** the SDK throws a CONTRACT error instead of returning the data

#### Scenario: Route coverage
- **WHEN** an API route is added without an SDK method
- **THEN** the contract test fails

### Requirement: Resumable event stream
The SDK SHALL stream run events, reconnect with Last-Event-ID a bounded number of times, and never deliver an event twice.

#### Scenario: Dropped stream
- **WHEN** the event stream drops before the run completes
- **THEN** the SDK reconnects with the last sequence number and delivers the remaining events in order without duplicates

### Requirement: No credentials in the browser client
The SDK SHALL accept no credential options and SHALL send no authorization or provider key headers; it authenticates with the session cookie and the per-run token only.

#### Scenario: Key passed to the SDK
- **WHEN** code passes an apiKey option to createApiClient
- **THEN** the SDK refuses to start
