# Proposal

## Why

Module 10 starts with the Model Context Protocol. Before learners discover tools (L47), read resources (L48) or combine servers (L50), they need to see a client connect to a server for real. Connecting means:

- picking a transport;
- negotiating a protocol revision;
- receiving the server's identity and instructions;
- releasing the connection afterwards.

They also need to see what happens when a connection fails, because MCP servers are separate processes or services that can be down, slow, misconfigured or blocked by policy. Every failure should give an understandable, safe error, never a crash or a stack trace.

## What Changes

- **New dependency.** `@mastra/mcp` 2.4.1, released with `@mastra/core` 1.78.0 (peer `>=1.76.0-0 <2.0.0-0`), installed in `packages/labs`.
- **New lab `lab-46`** (Module 10). Each run starts a local example MCP server and connects a Mastra `MCPClient` to it:
  - the server is a Mastra `MCPServer` with two read-only course tools and server instructions;
  - it is served over Streamable HTTP on `127.0.0.1` with an ephemeral port, inside the run;
  - the client uses the documented `url` server definition with `allowedHosts`, a timeout and `listToolsWithErrors({ perServerTimeoutMs })`.
- **The client shows:**
  - the negotiated protocol revision (`getServerProtocolVersions`);
  - the server identity (`getServerInfo`);
  - the server instructions (`getServerInstructions`), which are reviewed but not forwarded;
  - the tool names it advertised, with their namespaced keys.
- **Scenarios** (learner-selected, all local and deterministic):

  | Scenario | What happens | Category | Retriable |
  | --- | --- | --- | --- |
  | `healthy` | Normal connection | — | — |
  | `wrong-path` | HTTP 404 | `not-found` | no |
  | `refused` | Nothing is listening on the port | `unreachable` | yes |
  | `timeout` | The server accepts but never answers | `timeout` | yes |
  | `protocol-mismatch` | The client pins `legacy`; the server is 2026-07-28 only | `protocol-mismatch` | no |
  | `blocked-host` | `allowedHosts` excludes the server, so no request is sent | `blocked-by-policy` | no |

- **Failure handling:**
  - classification uses `errorDetails` (`httpStatus`, `code`, message);
  - each failure gets a learner-facing message and a hint;
  - retriable failures are retried up to `maxAttempts`, each time with a fresh client and a short backoff;
  - raw details are sanitized to their first line with paths removed;
  - every client is disconnected and the fixture server is closed in `finally`, also on cancellation.
- **Checks:**
  - `outcome-expected`;
  - `failure-classified`;
  - `retry-policy`;
  - `errors-sanitized`;
  - `resources-released`.

## Capabilities

### New Capabilities

- `course-labs/lab-46-connect-mcp-server`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-46/` and `packages/labs/package.json` (`@mastra/mcp`).
- **Modes:** offline only. No model is called. The MCP traffic is real HTTP, but only on loopback.
- **Release gate:** connecting to learner-supplied remote MCP servers is an SSRF risk and is not offered. It stays behind the release gates.
- **Not run:** the stdio transport, which spawns a subprocess, is shown in the solution but not run inside the API process.
