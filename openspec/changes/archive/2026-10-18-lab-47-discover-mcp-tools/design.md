# Design

## Context

Verified in a spike with `@mastra/mcp` 2.4.1:

- **Definitions.** `listToolDefinitionsWithErrors()` returns `{ definitions: { [server]: { [tool]: { name, description, inputSchema, outputSchema?, annotations?, server: { name, version } } } }, errors, errorDetails }`.
  - Schemas are JSON Schema 2020-12 (`$schema`, `properties`, `required`, `additionalProperties: false`, constraints such as `minLength` and `maximum`, `default`, `description`).
  - Annotations come from `createTool({ mcp: { annotations } })` on the server.
- **Tools.** `listTools()` returns Mastra tools keyed `server_tool`, with `tool.mcp.annotations` and `tool.title`.
  - `tool.execute(args)` validates the arguments against the advertised schema **on the client**.
  - On failure it returns `{ error: true, message, validationErrors }` instead of throwing.
  - Valid calls return the structured content. Server defaults are applied, so `{ query }` arrives with `limit: 3`.

## Decisions

- **Fixture.** `createFixtureMcpServer({ catalog: 'full', onCall })`.
  - `startLocalFixture({ catalog })` keeps `basic` (the L46 tools) as the default.
  - All fixture tools get annotations; the basic tools are read-only, and L46's output does not change.
  - `onCall(name)` counts server-side executions.
  - `search_labs({ query, limit })` matches catalog titles case-insensitively.
  - `reset_progress({ learnerId })` returns `{ reset: false, note }` and changes nothing.
- **Policy.** `decide(name, catalog, allowlist)` returns `{ allowed, reason }` in the order unknown, then allowlist, then read-only.
  - Suggestions are discovered names within Levenshtein distance 3, or containing or contained in the name; at most 3.
  - The tool name input is limited to 64 characters of `[\w.-]`, so a key such as `course_search_labs` resolves to `search_labs` when its prefix is the server key.
- **Validation result.** A result object with `error: true` and `validationErrors` gives `invalid-arguments`; the message is the first line. A thrown error gives `tool-error` with a sanitized message (L46 `sanitizeDetail`).
- **Output.** `mcpCatalog` follows the contract, plus `serverCalls` (counts) and `teardown`.
  - JSON Schemas are passed through as records.
  - The contract caps 50 tools and validates only the shape.
- **Web.** `mcpCatalogOf(output)` safe-parses the contract, and `McpToolCatalog` renders it.
  - Parameter rows come from `inputSchema.properties` and `required`. Type shows `type` or `enum`.
  - Constraints are shown for `minLength`, `maxLength`, `minimum`, `maximum`, `pattern` and `default`.
  - The raw schema sits in `<details>` with `<pre>`, as text.
- **Checks:**
  - `catalog-discovered`: the tool count equals what the fixture advertises, and every tool has an input schema of type object;
  - `schema-shown`: the output parses with `McpCatalogSchema`, and every tool has a parameter list;
  - `policy-enforced`: the call status matches `decide()` recomputed from the catalog, and a rejected call left the server counters at 0;
  - `call-reported`: a success has a result; a rejection or error has a reason and a message;
  - `resources-released`: as in L46.
