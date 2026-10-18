# Proposal

## Why

After connecting (L46), an MCP client learns what a server offers at runtime: tool names, titles, descriptions, JSON Schemas for inputs and outputs, and behaviour annotations. None of these are known at build time.

Learners need to read that metadata, see how it maps to a call, and apply a client-side permission policy before anything runs:

- a tool the server never advertised must be rejected;
- so must a tool that is not allowed, or arguments that do not match the schema.

The DoD asks for the UI to show the schema and the result, and for unknown tools to be rejected.

## What Changes

- **New lab `lab-47`** (Module 10). It starts the loopback fixture from L46 with a larger catalog:
  - `course_info`, `lab_title` and `search_labs`, all read-only;
  - `reset_progress`, annotated destructive, a no-op in the fixture that is never reachable through the default policy.
- **Discovery.** The client calls `MCPClient.listToolDefinitionsWithErrors()` and shows each tool's name, namespaced key, title, description, annotations, input schema and output schema. Nothing is hardcoded on the client.
- **Permission policy,** checked in this order, before any call:
  1. The tool must have been discovered, else `unknown-tool`, with close-name suggestions.
  2. It must be in the learner's allowlist, else `not-allowlisted`.
  3. It must be annotated `readOnlyHint: true`, else `not-read-only`. Annotations are trusted only because the fixture is our own server, which the lab states.
- **Call.**
  - A permitted tool is called through the Mastra tool from `listTools()`.
  - Arguments are validated against the advertised input schema on the client. A failure is reported as `invalid-arguments` with the field errors, and the server never sees the call.
  - A server-side tool error is reported as `tool-error`.
  - The result is the structured content. `tool-start` and `tool-finish` events are emitted, with `denied` for rejections.
- **Server-side call counter.** The fixture counts executions per tool, so the lab can prove that rejected calls never reached the server.
- **New contract `McpCatalogSchema`** in `@mlp/contracts`, placed at `output.mcpCatalog`, with a new web component `McpToolCatalog`:
  - for each tool, a card with badges, a parameter table derived from the JSON Schema and a collapsible raw schema;
  - a call panel with the arguments and either the result or the rejection reason and suggestions.

  Everything is rendered as text. L48–L50 reuse it.
- **Checks:**
  - `catalog-discovered`;
  - `schema-shown`;
  - `policy-enforced`;
  - `call-reported`;
  - `resources-released`.

## Capabilities

### New Capabilities

- `course-labs/lab-47-discover-mcp-tools`

### Modified Capabilities

(none)

## Impact

- **Files:**
  - `packages/labs/src/lab-47/`;
  - `packages/labs/src/lab-46/fixture-server.ts`: an optional catalog option; the L46 default is unchanged;
  - `packages/contracts/src/mcp-catalog.ts`;
  - `apps/web/src/components/workspace/McpToolCatalog.tsx`;
  - `RunTab.tsx`;
  - a new e2e spec.
- **Modes:** offline only, loopback, no model call.
