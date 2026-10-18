# Design

## Context

Verified in a spike with `@mastra/mcp` 2.4.1 and `@modelcontextprotocol/client` 2.2.0:

- **Existing tools.** `MCPServer({ tools })` serves existing course tools (`orderTotalTool`, `formatCurrencyTool`) unchanged. Tools without `mcp.annotations` are listed with `annotations: undefined`.
- **Authentication in front of the server.** An HTTP handler that answers 401 before calling `startHTTP` makes the SDK client's connect fail with `SdkHttpError` "Version negotiation failed: the server requires authorization (HTTP 401)", code `CLIENT_HTTP_AUTHENTICATION`.
  - The SDK client sends headers from `new StreamableHTTPClientTransport(url, { requestInit: { headers } })` on every request.
- **Calls.** `client.callTool({ name, arguments })` returns `{ content, structuredContent, isError }`.
  - **Unknown tool name:** the server answers `isError: true` with "Unknown tool: issue_refund", as a result rather than a protocol error.
  - **Invalid arguments:** validated by the server, `isError: true` with "Tool input validation failed for … - amountCents: Too small …".
  - The SDK client does not validate arguments itself.

## Decisions

- **Registry** (`registry.ts`).
  - `{ id, source, risk, description, tool }` for the five candidates.
  - The L15 tools come from `createSupportTools({ role: 'support-agent', actor: 'mcp-facade', audit, ledger })`. The ledger's `executeCount` proves `issue_refund` never ran.
- **Façade** (`facade.ts`).
  - **`planExposure(allowlist)`** returns `{ exposed, refused, unknownIds }`.
  - **`wrapTool(candidate, audit)`** is a `createTool` that keeps the same id, description and schemas and adds annotations. Its `execute`:
    - races the original `execute` against a 2 s timeout;
    - caps the result at 8 KB of JSON;
    - records `{ seq, tool, status: ok | error | timeout | too-large, ms, argBytes }`.
  - **`startFacade(exposed)`.**
    - Loopback HTTP server; the token is `randomBytes(24)` (base64url).
    - The Authorization header is compared with `timingSafeEqual`.
    - A `content-length` over 64 KB gives 413.
    - `startHTTP` options turn on DNS-rebinding protection for `127.0.0.1`.
    - Sockets are tracked as in L46. `close()` destroys the sockets and closes the `MCPServer`.
    - The token stays inside the run. The engine also masks configured secrets, but this token is never put in output or logs.
- **External client** (`external.ts`). The SDK `Client` with `versionNegotiation: { mode: 'auto' }`:
  1. connects without a token, and the 401 error is recorded;
  2. connects with the token, then calls `listTools` and `callTool`;
  3. always closes.

  Call results are mapped onto the `McpCall` contract:
  - success: `structuredContent`, or the text parsed as JSON;
  - `Unknown tool` gives rejected, `unknown-tool`, with the server's message;
  - `Tool input validation failed` gives rejected, `invalid-arguments`, with field errors parsed from `- field: message` lines;
  - anything else gives error, `tool-error`.
- **Inputs:**
  - `expose`: an array of up to 10 ids; default `calculate_order_total`, `inventory_lookup`, `format_currency`;
  - `toolName`: default `format_currency`;
  - `args`: default `{ amountCents: 1999, currency: 'EUR' }`.
- **Checks:**
  - `facade-scoped`: the exposed set equals allowlist ∩ read-only candidates, and every refused candidate has a reason;
  - `auth-enforced`: the unauthenticated connect was rejected with 401;
  - `external-discovery`: the external client's tool names equal the exposed set, each with an object input schema;
  - `allowlisted-call`:
    - an exposed tool gives `success` or `invalid-arguments`, with one audit entry;
    - a tool that is not exposed gives `unknown-tool`, with no audit entry and a refund ledger `executeCount` of 0;
  - `resources-released`.
