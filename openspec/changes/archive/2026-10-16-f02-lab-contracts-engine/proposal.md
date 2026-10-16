# Proposal

## Why

All 75 labs need one typed contract for lesson content, inputs, execution events, validation and progress, plus one safe execution engine. Without it each lab would reinvent streaming, cancellation and error handling, and the UI (F04) could not render labs generically.

## What Changes

- Zod schemas + TypeScript types in `@mlp/contracts`: `LabDefinition`, `LabModule`, `LessonGuide`, `InputField`, `ExecutionRequest`, `ExecutionEvent` (`log`, `token`, `tool-start`, `tool-finish`, `workflow-step`, `result`, `error`, `complete`), `ValidationResult`, `QuizQuestion`, `ProgressRecord`, `InstructorOutline`, `RunSnapshot`, `PreflightResult`; `ApiError` gains `retryable`.
- New server-only `@mlp/lab-engine`: lab registry, `LabRunner` (request/correlation ids, explicit start/stop, AbortController, deadlines, concurrency limit, bounded event buffer, canonical error mapping, safe logging), run store with TTL.
- New server-only `@mlp/labs`: lab implementations; **Dummy Lab 00** (deterministic, offline, zero cost) plus a conformance test suite every lab must pass.
- API routes: `GET /api/labs`, `GET /api/labs/:labId`, `GET /api/labs/:labId/source`, `GET /api/labs/:labId/preflight`, `POST /api/labs/:labId/runs`, `GET /api/runs/:runId`, `GET /api/runs/:runId/events` (SSE), `POST /api/runs/:runId/cancel`; request-id middleware.
- Config: `MAX_CONCURRENT_RUNS`, `RUN_DEFAULT_TIMEOUT_MS`, `RUN_MAX_TIMEOUT_MS`, `SSE_DISCONNECT_GRACE_MS`.

## Capabilities

### New Capabilities

- `lab-contracts`: shared schemas describing labs, events, validation, quiz and progress.
- `lab-execution`: running, streaming, cancelling and validating lab runs through the API.

### Modified Capabilities

(none — the catalog keeps its existing requirements)

## Impact

New packages `packages/lab-engine`, `packages/labs`. New API routes. No UI changes (F04). No Lab 01–75.
