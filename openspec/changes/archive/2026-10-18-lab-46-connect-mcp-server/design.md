# Design

## Context

Verified in a spike with `@mastra/mcp` 2.4.1:

- **Healthy connection.** `new MCPClient({ id, servers: { name: { url, allowedHosts } }, timeout })`, then `listToolsWithErrors({ perServerTimeoutMs })`:
  - connects in about 150 ms against an `MCPServer` served by `server.startHTTP({ url, httpPath, req, res })` from a Node `http` server;
  - `getServerProtocolVersions()` gives `2026-07-28`;
  - `getServerInfo()` gives `{ name, version, description }`;
  - `getServerInstructions()` gives the instructions;
  - tools are keyed `name_tool`.
- **Failures come back as data in `errors` / `errorDetails`;** `listToolsWithErrors` does not throw:

  | Case | Result |
  | --- | --- |
  | Wrong path | `httpStatus` 404, code `CLIENT_HTTP_NOT_IMPLEMENTED` |
  | Closed port | `ERA_NEGOTIATION_FAILED` ("Version negotiation probe failed: fetch failed") |
  | Silent server | "Discovery timed out after N ms", after the per-server timeout |
  | `protocolVersion: 'legacy'` against a 2026-07-28-only `MCPServer` | `httpStatus` 400, JSON-RPC -32022 "Unsupported protocol version" |
  | `allowedHosts` excluding the server | "Host … is blocked by the allowedHosts policy … The request was not sent." |

- **Messages contain stack traces with absolute local paths.** The client and server also log through their Mastra loggers.
- **The client refuses well-known unsafe ports.** Port 1 fails with "bad port", so a closed port is made by binding an ephemeral port and closing it.

## Decisions

- **Fixture server.**
  - An `MCPServer` (`course-fixture`, version 1.0.0) with read-only `course_info` and `lab_title`, plus instructions.
  - Served by a per-run Node HTTP server on `127.0.0.1:0`, path `/mcp`.
  - DNS-rebinding protection is on (`allowedHosts: ['127.0.0.1']`).
  - The `timeout` scenario uses a second server that accepts requests and never answers.
  - All sockets are destroyed on close.
- **Client.**
  - One `MCPClient` per attempt with a unique id (instance-leak guard), the server key `course`, `allowedHosts` set to the exact fixture host and port, and the learner's `timeoutMs` for both the client timeout and `perServerTimeoutMs`.
  - Mastra loggers on the client and server are replaced with a no-op logger; the lab logs its own classified lines.
- **Classification,** applied in order:
  1. A message containing `allowedHosts` gives `blocked-by-policy`.
  2. `httpStatus` 400 with "Unsupported protocol version" gives `protocol-mismatch`.
  3. `httpStatus` 404 gives `not-found`.
  4. Any other 4xx gives `rejected`.
  5. A message containing "timed out" gives `timeout`.
  6. `ERA_NEGOTIATION_FAILED`, "fetch failed" or `ECONNREFUSED` gives `unreachable`.
  7. Anything else gives `unknown`.

  Only `unreachable` and `timeout` are retriable.
- **Sanitizing.**
  - The detail is the first line, with `C:\…` and `/…/` file paths replaced by `<path>`, capped at 240 characters.
  - The output never contains `at ` stack frames. A check scans the serialized output and logs for frames and drive paths.
- **Retries.** At most `maxAttempts` attempts (1–3). Backoff is 100 ms × attempt and honours the abort signal. Non-retriable failures stop after the first attempt.
- **Teardown.** `client.disconnect()` runs after each attempt. Fixture servers are closed in `finally`. The output reports `clientsDisconnected`, `fixtureClosed` and `openSockets` (0 is expected).
- **Events.** `workflow-step` for `start-fixture`, `connect #n` and `teardown`, plus log lines per attempt and per outcome.
- **Expected outcome per scenario.** The scenario fixes the expected status and category. `outcome-expected` compares the actual status and category against them, so every scenario is a passing lab run when handled correctly.

## Risks / Trade-offs

- **Loopback only.** No external server is contacted, so the lab is offline-only.
- **Timing.** The `timeout` scenario waits for `timeoutMs` per attempt (default 1500 ms × 2).
