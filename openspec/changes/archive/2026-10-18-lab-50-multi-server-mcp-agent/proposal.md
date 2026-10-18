# Proposal

## Why

Real agents use several MCP servers at once. That raises three problems:

1. **Name collisions.** Two servers can offer a tool with the same name.
2. **Routing.** Every call must reach the server that owns the tool.
3. **Partial failure.** One server being down must not take the whole agent down.

The DoD asks for a local calculator server and a data server, with namespaces and collision policies. Calls must route to the correct server, and one offline server must not crash the lab.

## What Changes

- **New lab `lab-50`** (Module 10). Two loopback `MCPServer`s start inside the run:
  - `calc` (Calculator server): `add`, `multiply`, `percent_of`, `info`;
  - `data` (Course data server): `lab_title`, `search_labs`, `info`.

  Both offer `info`, a deliberate collision. All tools declare output schemas, so results arrive as structured content.
- **One `MCPClient`** with both servers; discovery uses `listToolsetsWithErrors({ perServerTimeoutMs })`.
  - `downServer` (none, calc or data) points that server at a closed loopback port.
  - Its failure is classified with the L46 classifier, and the agent continues with the healthy server's tools.
- **Collision policies:**

  | Policy | Tool names | What happens to `info` |
  | --- | --- | --- |
  | `namespace` (default) | Mastra's `server_tool` keys | No collision: `calc_info` and `data_info` |
  | `first-wins` | Flat names, servers in the order calc, data | `data.info` is shadowed and reported |
  | `reject` | Flat names | Both `info` tools are excluded and reported |

  - A collision report lists every name offered by more than one server, with its resolution.
  - A namespaced-key check also catches `server_tool` keys that collide after namespacing (for example, server `a_b` with tool `c` and server `a` with tool `b_c`).
- **Routing table.** Exposed name → `{ server, tool }`. Each fixture server counts its own executions, so the check compares server-side counts with the agent's successful tool calls.
- **Agent.**
  - A Mastra `Agent` with the exposed tools; tool events come from `streamAgent`.
  - Offline, a scripted model picks tools by name pattern from `view.toolNames` (for example, `percent_of`, or a name ending in `_percent_of`). When a needed tool is missing, it says which capability is unavailable.
  - Live, a real model (`modelId`) with instructions to use the right server's tools and to report missing capabilities.
- **Checks:**
  - `servers-connected`;
  - `collisions-resolved`;
  - `calls-routed`;
  - `partial-failure-isolated`;
  - `answer-grounded`;
  - `resources-released`.

## Capabilities

### New Capabilities

- `course-labs/lab-50-multi-server-mcp-agent`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-50/`, and `lab-46/fixture-server.ts`, which exports a reusable `serveOnLoopback(mcpServer)`.
- **Modes:** offline (scripted, free) and live (one agent run, a few tool steps).
