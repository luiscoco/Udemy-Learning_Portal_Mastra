# course-labs/lab-47-discover-mcp-tools Specification

## Purpose
Define the Discover MCP tools lab: runtime tool metadata with JSON Schemas and annotations from a local MCP server, a client-side policy (discovered, allowlisted, read-only), a permitted call with its result, and rejection of unknown tools and invalid arguments before they reach the server.

## Requirements

### Requirement: Dynamic MCP tool discovery
Lab 47 SHALL list tool metadata from the local MCP server at runtime and show each tool's name, title, description, annotations and input and output JSON Schemas in the UI.

#### Scenario: Catalog shown
- **WHEN** the example runs offline
- **THEN** the four advertised tools appear with their schemas and annotations, and the parameter table of `search_labs` lists `query` (required) and `limit`

### Requirement: Permitted read-only tool call
The lab SHALL call a tool only when it was discovered, is in the allowlist and is annotated read-only, and SHALL show its arguments and result.

#### Scenario: Read-only call
- **WHEN** the tool is `search_labs` with `{ "query": "memory" }`
- **THEN** the call succeeds and the matching labs are shown

#### Scenario: Unknown tool rejected
- **WHEN** the tool is `delete_everything`
- **THEN** the call is rejected as `unknown-tool` before anything is sent, and the server records no call

#### Scenario: Not permitted
- **WHEN** the tool is `reset_progress`, even after adding it to the allowlist
- **THEN** it is rejected (`not-allowlisted` or `not-read-only`) and never executed

#### Scenario: Invalid arguments
- **WHEN** the arguments do not match the input schema
- **THEN** the call is rejected as `invalid-arguments` with field errors, and the server records no call
