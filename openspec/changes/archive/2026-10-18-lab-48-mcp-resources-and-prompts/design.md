# Design

## Context

Verified in spikes with `@mastra/mcp` 2.4.1 and `@modelcontextprotocol/client` 2.2.0:

- **SDK client probe.** `new Client(info, { versionNegotiation: { mode: 'auto' } })` with `StreamableHTTPClientTransport` connects to an `MCPServer` with protocol 2026-07-28.
  - `getServerCapabilities()` gives `{ tools: { listChanged }, logging: {} }`.
  - The server adds `resources: { subscribe, listChanged }` when `resources` is configured, and `prompts: { listChanged }` when `prompts` is configured.
- **Lists on a missing capability.** `MCPClient.resources.list()`, `resources.templates()` and `prompts.list()` (and the SDK `listResources` and `listPrompts`) on a server without the capability:
  - return `[]` with a console warning ("server does not advertise resources capability - returning empty list");
  - give no error.
- **Reads and gets on a missing capability.** `resources.read()` and `prompts.get()` on such a server fail with JSON-RPC -32601 "Method not found".
- **`MCPServer` resources.**
  - `resources/read` resolves only URIs returned by `listResources`; otherwise it fails with -32602 "Resource not found: …".
  - Templates are listed, but URIs built from them cannot be read unless they are also listed.
  - `prompts/get` validates required arguments ("Missing required argument: number") and unknown names ("Prompt "x" not found").
- **Subscriptions.** `MCPClient.resources.subscribe` and `unsubscribe` succeed against `MCPServer` (`subscriptions/listen`). A server that declines a URI throws "Server declined resource subscriptions for: …".
- **Completions.** The SDK `Client.complete()` exists. `MCPServer` does not advertise `completions` and answers -32601. `MCPClient` has no completion API.
- **Logging.** The server advertises `logging`. `logging/setLevel` is not part of the 2026-07-28 wire era (the SDK refuses it locally). Mastra sends a per-request log level in `_meta` (`enableServerLogs`, `serverLogLevel`).
- **Client features.** Mastra docs: roots and sampling are not supported by `MCPClient`. Elicitation is replaced by `inputRequests` (`input_required`) on 2026-07-28.

## Decisions

- **Probe order.**
  1. The SDK client connects, reads the capabilities and runs `complete()` (expected to fail when completions are not advertised). It always closes.
  2. The Mastra client lists tools, resources, templates and prompts with `listWithErrors` (a missing capability gives `[]`), and does a subscribe/unsubscribe round trip only when `resources.subscribe` is advertised.
  3. The requested operation runs.
- **Matrix rows** `{ feature, protocol, server, mastra, observed, note }`:
  - `server` is `advertised`, `not-advertised` or `n/a` for client-side features;
  - `mastra` is `supported`, `limited` or `not-exposed`.

  The `limited` rows:
  - resources, because a list on a missing capability returns `[]`;
  - templates, because reads only work for listed URIs;
  - logging, because there is no setLevel; per-request `_meta` is used instead.

  The `not-exposed` rows: completions, roots, sampling. Elicitation is `supported`, as `inputRequests`.
- **Operation.** `operation: read-resource | get-prompt`, with `resourceUri` (default `course://syllabus`), `promptName` (default `explain-lab`) and `promptArgs` (string values).
  - **read-resource.**
    - Without the resources capability, fall back to the `course_info` tool.
    - If the URI matches `course://labs/{number}` and is not listed, try it once (to show the real error), then fall back to `lab_title`.
    - Otherwise read it. An unknown URI gives a classified error with no fallback.
  - **get-prompt.**
    - Without the prompts capability, render a local template. For `explain-lab` and `study-plan` the text is fixed and labelled; other names give a classified error.
    - Otherwise call `prompts.get`. Missing arguments and unknown names give classified errors.
- **Result.** `{ source: 'server' | 'fallback', via, content, fallbackReason? }`. Errors are `{ code: unknown-resource | unknown-prompt | missing-argument | method-not-found, message }`, sanitized.
- **Contract.** `McpCapabilitiesSchema`: server info, protocol, raw advertised capabilities (record), rows and operation. The web component renders a table with a caption and the operation panel, all as text, inside a focusable scroll region.
