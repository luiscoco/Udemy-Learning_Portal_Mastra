## ADDED Requirements

### Requirement: MCP handshake with a local example server
Lab 46 SHALL connect a Mastra MCPClient to a local example MCPServer over Streamable HTTP on loopback using the documented client configuration, and show the negotiated protocol, server identity, instructions and advertised tools.

#### Scenario: Healthy handshake offline
- **WHEN** the example runs with scenario `healthy`
- **THEN** the connection succeeds on the first attempt with protocol `2026-07-28`, the server name and version, its instructions and its tool names, and the client and server are released afterwards

### Requirement: Connection failures handled
Connection failures SHALL be classified, explained with a hint, retried only when retriable, sanitized, and never crash the run.

#### Scenario: Unreachable server
- **WHEN** the scenario is `refused`
- **THEN** the failure is classified `unreachable`, retried up to `maxAttempts`, and reported without stack traces or local paths

#### Scenario: Non-retriable failure
- **WHEN** the scenario is `wrong-path`, `protocol-mismatch` or `blocked-host`
- **THEN** the failure is classified `not-found`, `protocol-mismatch` or `blocked-by-policy` after exactly one attempt

#### Scenario: Silent server
- **WHEN** the scenario is `timeout`
- **THEN** each attempt ends after the configured timeout, the failure is classified `timeout`, and all sockets are closed
