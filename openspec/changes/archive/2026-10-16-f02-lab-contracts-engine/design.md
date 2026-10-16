# Design

## Context

F01 delivered `@mlp/contracts` (health, ApiError, catalog), `@mlp/lab-catalog` and an Express API. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** one generic engine that any lab plugs into; deterministic offline execution; resource safety (deadline, abort, concurrency, bounded buffers, disconnect cleanup).

**Non-Goals:** UI rendering (F04), Mastra model adapters (L03+), persistence of runs across restarts, multi-instance scaling.

## Decisions

### Package split
- `@mlp/contracts` (browser-safe): every schema. Web validates API responses with them.
- `@mlp/lab-engine` (server-only, no Mastra): `LabImplementation` interface, `LabRegistry`, `LabRunner`, `RunStore`, `LabError`, `toApiError`. Keeps orchestration independent of Mastra so the engine is testable with plain functions.
- `@mlp/labs` (server-only): one folder per lab `src/lab-XX/` with `definition.ts` (content), `run.ts` (implementation), `fixtures.ts`, tests. `src/index.ts` exports `allLabs`.
- Alternative considered: lesson content in `lab-catalog` bundled into the web app. Rejected: bundles 75 lessons into the client and duplicates content; the API serves definitions instead, while `lab-catalog` stays the lightweight sidebar index. A consistency test ties the two together.
- Naming: `LabModule` is the course-module grouping (alias of the catalog module schema); the server implementation interface is `LabImplementation`.

### Run lifecycle
```
POST /labs/:id/runs ──► validate ──► RunStore.create ──► runner executes async
                                         │ events[] (bounded)      │ emit()
GET /runs/:id/events ◄── replay buffer ──┴── live subscribers ◄────┘
POST /runs/:id/cancel ──► controller.abort('cancelled')
deadline timer       ──► controller.abort('timeout')
```
- Start and stream are separate requests so `EventSource` (GET only) works natively and reconnects with `Last-Event-ID`.
- The runner races the lab promise against the abort signal: a lab that ignores the signal still ends with `complete` on time; late emits are dropped.
- After `complete`, `emit` is a no-op (guarantees "exactly one terminal event").
- Event buffer bounded (`MAX_EVENTS_PER_RUN = 5000`); overflow emits one `log` warning annotated `truncated: true` and drops further non-terminal events.
- Finished runs retained 10 min (TTL sweep, `unref`'d timer) for late subscribers.
- Disconnect: when the last SSE subscriber leaves an active run, a grace timer (`SSE_DISCONNECT_GRACE_MS`, default 5000) aborts the run with reason `disconnected` (reported as `cancelled`).
- Concurrency: global active-run cap (`MAX_CONCURRENT_RUNS`, default 4) → 429 retryable.

### Error mapping
`LabError(code, message, { retryable, details })` is the only way labs signal typed failures. `toApiError` maps: `LabError` → its code; `ZodError` → `VALIDATION_FAILED` with paths; abort reasons → `CANCELLED`/`TIMEOUT`; anything else → `INTERNAL` "Lab execution failed" (original message only in server debug log, redacted). All messages pass through `redactSecrets`.

### Source serving
Declared `sourceFiles` are validated at registration (`^[\w./-]+\.(ts|tsx|json|md)$`, no `..`, no absolute). The API resolves them under `packages/labs/src/<lab-id>/` via `require.resolve('@mlp/labs/package.json')`, which works in dev and from the tsup bundle since the workspace symlink exists.

### SSE format
`id: <seq>\nevent: <type>\ndata: <json>\n\n`, heartbeat comment every 15 s, headers `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.

## Risks / Trade-offs

- [In-memory store loses runs on restart] → acceptable for local LMS; documented.
- [Token events can be numerous] → bounded buffer + truncation annotation.
- [Lab code ignoring AbortSignal keeps running in background] → its emits are dropped and resources released from the store; labs are reviewed code (no student code executed), conformance tests check signal use where applicable.

## Migration Plan

Additive. `ApiError` gains optional `retryable` (backward compatible).
