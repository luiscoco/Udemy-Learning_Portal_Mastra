# Proposal

## Why

MCP servers can offer more than tools:

- **resources:** data identified by URI, plus URI templates and subscriptions;
- **prompts:** reusable message templates with arguments;
- **completions** and **logging**.

Whether a feature is usable depends on three separate layers:

1. what the protocol defines;
2. what this server advertises in its capabilities;
3. what the Mastra adapter (`MCPClient` / `MCPServer`) actually exposes or implements.

Learners must not confuse these layers. The DoD asks for a documented capability probe and a graceful fallback when something is missing.

Spikes show why this matters. On a server that does not advertise resources or prompts, `resources.list()` and `prompts.list()` return `[]`. That looks the same as a server that supports resources and has none.

## What Changes

- **New dependency.** `@modelcontextprotocol/client` 2.2.0, the official MCP TypeScript SDK client that `@mastra/mcp` 2.4.1 already pins, added as a direct dependency of `packages/labs`. It is the protocol-level probe:
  - `Client.connect` with `versionNegotiation: { mode: 'auto' }`;
  - `getServerCapabilities()`, `getNegotiatedProtocolVersion()` and `getServerVersion()`.
- **Fixture.** `startLocalFixture({ catalog, resources, prompts })` adds:
  - **Resources:** `course://syllabus` (Markdown generated from the module catalog) and `course://about`.
  - **Template:** `course://labs/{number}`.
  - **Prompts:** `explain-lab` (argument `number`, required) and `study-plan` (argument `hoursPerWeek`, optional).

  The defaults are unchanged for L46 and L47.
- **New lab `lab-48`** (Module 10).
  - **Server choice:** `full` (tools, resources and prompts) or `tools-only`.
  - **Operation:** read a resource by URI, or get a prompt with arguments.
  - **Capability matrix,** one row per feature, with four columns (protocol, server advertised, Mastra adapter, observed). The features are:
    - tools;
    - resources (list and read);
    - resource templates;
    - resource subscriptions;
    - prompts;
    - completions;
    - logging;
    - the client-side features roots, sampling and elicitation.
  - **Observed results** come from real calls where safe: listing, a subscribe/unsubscribe round trip, and `complete()` through the SDK.
- **Graceful fallbacks,** chosen from the probe before anything is sent, or from a classified failure:

  | Situation | Fallback |
  | --- | --- |
  | Server without resources | The `course_info` tool, labelled as a fallback |
  | URI built from a template | `MCPServer` only resolves listed URIs, so the template variable is parsed and the `lab_title` tool is called |
  | Server without prompts | A local prompt template, labelled "local fallback, not from the server" |
  | Unknown resource or prompt, or a missing required prompt argument | A classified error; no fallback |

- **New contract `McpCapabilitiesSchema`** at `output.mcpCapabilities`, with a web table component `McpCapabilityMatrix`.
- **Checks:**
  - `capabilities-probed`;
  - `layers-distinguished`;
  - `operation-handled`;
  - `fallback-labelled`;
  - `resources-released`.

## Capabilities

### New Capabilities

- `course-labs/lab-48-mcp-resources-and-prompts`

### Modified Capabilities

(none)

## Impact

- **Files:**
  - `packages/labs/src/lab-48/`;
  - the L46 fixture: optional resources and prompts;
  - `packages/contracts/src/mcp-capabilities.ts`;
  - `apps/web/src/components/workspace/McpCapabilityMatrix.tsx`;
  - `RunTab.tsx`;
  - an e2e spec.
- **Modes:** offline only, loopback, no model call.
