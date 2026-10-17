# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike):

- **Same context in agent and tool.** The agent's instructions function and the tool's `execute(input, context)` see the same `RequestContext`, through `context.requestContext`. Mastra added no keys of its own during `generate` with tools.
- **Model-chosen extra arguments are stripped.** A tool call `{ status: "open", tenantId: "globex" }` reaches `execute` as `{ status: "open" }`, because the input schema has no `tenantId`.
- **Tool context schema.** A tool's `requestContextSchema` failure returns an `{ error: true, message }` tool result and `execute` does not run. The message includes the provided context, so request context must never hold secrets.
- **Reserved keys.** `isReservedRequestContextKey('mastra__resourceId')` and `isReservedRequestContextKey('__mastra_x')` are true.

## Decisions

- **Two input sources with different trust.**
  - Claims are trusted, because in production they come from a verified session or JWT. They are still validated, and invalid claims fail the request closed.
  - Headers are untrusted, and only a mapped allowlist is accepted: `x-locale` → `locale`, `x-request-id` → `requestId`.
  - Headers named after claims (`x-tenant-id`, `x-user-id`, `x-plan`) are rejected explicitly, with the reason "cannot override a verified claim".
- **Strict schemas.** The built context is parsed with a strict Zod schema, and the same schema is the agent's `requestContextSchema`. The tool declares only what it needs (`tenantId`, `userId`; other trusted keys pass through, since Mastra hands every tool the whole call context). The tool fetches data only by the context tenant, and its output carries the tenant used, so the check can prove it.
- **An adversarial offline model.** The offline model obeys the injection on purpose: it calls `listInvoices` with `tenantId: "globex"`. This shows that platform controls, not model behaviour, enforce the boundary. Live models may refuse the injection; the checks pass either way.
- **Defaults.** Missing optional headers default to `locale: en-US` and `requestId: req-0000`. Defaults are recorded in the result.

## Risks

- None beyond the ones documented: request context is not a secret store.
