# Design

## Decisions

- Verified with the installed version: `generate()` resolves to an object with `text`, `finishReason`, `usage`, `response.{id,modelId,timestamp}`, `runId`, `traceId`, and **rejects** when the model throws (the agent's default `maxRetries` is 0).
- Fault injection lives in the scripted model (`error` turn or empty text), so the real Mastra error path is exercised.
- `withLabLogger(ctx, agent)` uses `agent.__setLogger()` (MastraBase API) so Mastra's "Error in agent stream" logs go through the run's redacting logger instead of stdout.
- `ctx.throwIfAborted()` in the catch block separates cancellation/timeouts from provider failures.
