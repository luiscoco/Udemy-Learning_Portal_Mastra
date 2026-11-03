## MODIFIED Requirements

### Requirement: Error mapping and safe logging
Lab failures SHALL be mapped to canonical error codes; model provider HTTP errors SHALL map to NOT_CONFIGURED (401/403), TOO_MANY_REQUESTS (429) or PROVIDER_ERROR (other 4xx/5xx) with fixed messages that never copy the provider's text; other unknown errors become `INTERNAL` with a generic message, and any configured secret value is redacted from event payloads and logs.

#### Scenario: Secret in error message
- **WHEN** a lab throws an error whose message contains a configured API key
- **THEN** the emitted error event and server log contain only the masked key

#### Scenario: Provider rejects the API key
- **WHEN** a live model call fails with HTTP 401 from the provider
- **THEN** the run fails with NOT_CONFIGURED, a message telling the operator to check the server key, and no provider text
