# course-labs/lab-49-expose-mastra-over-mcp Specification

## Purpose
Define the Expose Mastra over MCP lab: a narrowly scoped MCPServer façade that publishes only allowlisted, read-only Mastra tools from earlier labs behind a per-run bearer token with limits and an audit trail, verified by an external MCP SDK client.

## Requirements

### Requirement: Narrowly scoped MCP façade
Lab 49 SHALL expose selected Mastra tools over MCP only when they are allowlisted and classified read-only, and SHALL refuse every other candidate with a reason.

#### Scenario: Default façade
- **WHEN** the example runs with the default allowlist
- **THEN** `calculate_order_total`, `inventory_lookup` and `format_currency` are exposed, and `lookup_order` (personal data) and `issue_refund` (side effect) are refused

#### Scenario: Unsafe tool allowlisted
- **WHEN** `issue_refund` is added to the allowlist
- **THEN** it is still refused as `side-effect` and is not registered on the server

### Requirement: External client discovers and calls an allowlisted tool
An external MCP client (the MCP TypeScript SDK, not Mastra) SHALL authenticate, discover exactly the exposed tools and call one of them.

#### Scenario: Allowlisted call
- **WHEN** the external client calls `format_currency` with `{ "amountCents": 1999, "currency": "EUR" }`
- **THEN** the result is `€18.39`, and the façade audit records one successful call

#### Scenario: Unauthenticated client
- **WHEN** a client connects without the bearer token
- **THEN** the connection is rejected with HTTP 401

#### Scenario: Tool not exposed
- **WHEN** the external client calls `issue_refund`
- **THEN** the server answers "Unknown tool", the audit has no entry, and the refund was never executed
