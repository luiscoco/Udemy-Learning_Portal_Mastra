## ADDED Requirements

### Requirement: Request-scoped instructions
Lab 16 SHALL use one agent whose instructions are resolved from each call's `RequestContext` (persona, tone, locale, request id), validated by the agent's `requestContextSchema`.

#### Scenario: Example profiles
- **WHEN** the example runs three profiles (Ava friendly en-US, Lucía formal es-ES, Kenji concise ja-JP)
- **THEN** each request's resolved instructions name only its own persona, locale and request id, and each answer ends with its own persona's sign-off

#### Scenario: Locale-formatted facts
- **WHEN** a profile uses locale `de-DE`
- **THEN** its instructions and answer contain the total formatted for `de-DE` (`45,90 €`)

### Requirement: Parallel isolation
All profiles SHALL run concurrently against the same agent instance, and no request SHALL receive another request's settings.

#### Scenario: Parallel requests preserve independent instructions
- **WHEN** the profiles run in parallel with the `request-context` strategy
- **THEN** every request overlaps in time with the others and the `instructions-isolated` and `answers-signed` checks pass

#### Scenario: Shared module state leaks
- **WHEN** the strategy is `shared-module-state`
- **THEN** every request resolves the last profile's instructions, the run succeeds and the isolation checks fail

### Requirement: Context schema enforcement
The lab SHALL demonstrate that an invalid request context is rejected before any model call.

#### Scenario: Invalid locale
- **WHEN** the probe call passes locale `xx-XX`
- **THEN** it fails with `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED` and no model call is made
