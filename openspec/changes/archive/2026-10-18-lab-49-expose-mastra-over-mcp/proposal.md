# Proposal

## Why

After consuming MCP servers (L46–L48), learners publish their own Mastra functionality over MCP. Exposing tools to outside clients is a security boundary. The server should publish only a narrow, deliberately chosen set of safe tools, and nothing else:

- no side effects;
- no personal data;
- no ambient credentials.

It should also authenticate callers, bound its inputs and outputs, and keep an audit trail.

The DoD asks that an external MCP client can discover and call an allowlisted tool.

## What Changes

- **New lab `lab-49`** (Module 10). It builds an MCP façade over real Mastra tools from earlier labs:

  | Tool | From | Risk |
  | --- | --- | --- |
  | `calculate_order_total` | L11 | read-only |
  | `inventory_lookup` | L13 | read-only |
  | `format_currency` | L13 | read-only |
  | `lookup_order` | L15 | personal data |
  | `issue_refund` | L15 | side effect, approval required |

- **Façade policy.** A tool is exposed only if it is on the learner's allowlist and its registry risk is `read-only`.
  - Every other candidate is refused, with a reason: `not-allowlisted`, `side-effect` or `personal-data`.
  - Unknown ids are reported.
- **Exposed tools are wrappers.** Each is created with `createTool`, keeping the original input and output schemas and the description, and adds:
  - MCP annotations (read-only, non-destructive, idempotent, closed world);
  - a 2 s execution timeout;
  - an 8 KB result cap;
  - an audit entry (tool, status, duration and argument size; no argument values).
- **Façade server:**
  - a Mastra `MCPServer` served with `startHTTP` on `127.0.0.1` with an ephemeral port and DNS-rebinding protection;
  - a per-run bearer token, compared in constant time, never returned or logged;
  - requests over 64 KB rejected with 413.
- **External client.** The official MCP TypeScript SDK client (not Mastra) is the external consumer:
  1. connecting without the token must fail with 401;
  2. with the token, it lists the tools and calls the learner's chosen tool with the learner's arguments.

  A call to a tool that is not exposed is answered by the server as "Unknown tool" and is never executed: the audit trail and the refund ledger stay empty.
- **Output.** `mcpCatalog` (the L47 contract and `McpToolCatalog` UI), filled from the external client's view, plus `facade`, `external`, `audit` and `teardown`.
- **Checks:**
  - `facade-scoped`;
  - `auth-enforced`;
  - `external-discovery`;
  - `allowlisted-call`;
  - `resources-released`.

## Capabilities

### New Capabilities

- `course-labs/lab-49-expose-mastra-over-mcp`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-49/`. The L11, L13 and L15 tools are imported, not modified.
- **Modes:** offline only. Loopback only; no model is called.
- **Release gate:** serving MCP on a public interface is not offered. That needs real authentication (OAuth via `MCPServer` OAuth middleware) and rate limits, which are release-gated.
