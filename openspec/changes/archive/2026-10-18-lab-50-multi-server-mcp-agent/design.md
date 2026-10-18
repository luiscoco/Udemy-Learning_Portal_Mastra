# Design

## Context

Verified in a spike with `@mastra/mcp` 2.4.1:

- **Discovery shapes.**
  - `listToolsetsWithErrors()` groups tools by server key, with the server's own tool names: `{ calc: { percent_of, info }, data: { lab_title, info } }`. An unreachable server appears only in `errors` / `errorDetails`.
  - `listTools()` namespaces keys and ids as `server_tool`.
- **Re-keyed tools route correctly.** A tool from a toolset can be re-keyed (`{ info: toolsets.calc.info }`) and passed to an `Agent`. The model sees the key, and execution still goes to the owning server.
- **Results.** A tool without an `outputSchema` returns the raw MCP result (`content`, `isError`). With one, the result is the structured content.

## Decisions

- **Servers** (`servers.ts`).
  - `createCalculatorServer(counter)` and `createDataServer(counter)` build `MCPServer`s from `createTool` tools with input and output schemas and read-only annotations.
  - `percent_of` returns `{ result: percent × value / 100 }`; `add` and `multiply` return `{ result }`.
  - The data server reuses the course catalog (`LABS`).
  - Both `info` tools return `{ server, description }`.
  - `serveOnLoopback(mcp)` (exported from the L46 fixture module) serves a server with socket tracking. A closed port is made as in L46.
- **Policies** (`policy.ts`).
  - `exposeTools(toolsets, order, policy)` returns `{ tools: Record<name, Tool>, routing: Record<name, { server, tool }>, collisions: [{ name, servers, resolution }] }`.
  - `namespacedKeyCollisions(toolsets)` detects `server_tool` key clashes.
  - The order is fixed as `calc`, then `data`.
- **Offline script** (`offlineScript(question)`), working from the question and `view.toolNames`:
  - `X% of Y` → the percent tool;
  - `lab N` → the lab-title tool;
  - "which servers" or "info" → every info tool;
  - "plus" / "times" → add / multiply.

  After the tool results arrive, it writes one sentence per result plus one sentence per missing capability ("…is unavailable: no percent_of tool (its server may be offline)").
- **Run.**
  1. Start the healthy servers.
  2. Build the client, using the closed URL for `downServer`.
  3. Discover with `perServerTimeoutMs` 1500, classify the errors, and apply the policy.
  4. Run the agent (`maxSteps` 4) and record the tool traces with their routed server.
  5. Disconnect and close.
- **Checks:**
  - `servers-connected`: each server is connected, except `downServer`, which is failed with a known category;
  - `collisions-resolved`: the exposed names are unique, and the resolution matches the policy for every name offered by more than one connected server;
  - `calls-routed`: for every successful call, `routing[name].server`'s counter for `routing[name].tool` matches, and the totals equal the successful calls;
  - `partial-failure-isolated`:
    - with a server down, the run succeeds, at least one healthy-server tool succeeds when the question needs one, and the answer states the missing capability;
    - otherwise, no failures;
  - `answer-grounded`: each successful result's key value (percent result, lab title, server name) appears in the answer;
  - `resources-released`.
