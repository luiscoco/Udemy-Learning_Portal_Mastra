# Timeouts and failure testing

Put every dependency behind the same boundary, and keep retries in exactly one layer.

```ts
// One attempt: race the work against a timer that ABORTS it; retry only what may succeed later.
const r = await resilientCall('tracker', (signal) => carrier.track(orderId, { signal }), {
  attempts: 3, timeoutMs: 500, baseDelayMs: 50, breaker: trackerBreaker, signal: questionSignal,
});
return r.ok ? r.value : { ok: false, degraded: true, reason: r.outcome }; // the agent answers the rest

// Models: the guard owns attempts; Mastra's native fallback array then switches at once.
const agent = new Agent({
  model: [
    { model: guardModel(primary, { attempts: 3, timeoutMs: 6000, breaker: primaryBreaker, ... }), maxRetries: 0 },
    { model: guardModel(fallback, { attempts: 3, timeoutMs: 6000, breaker: fallbackBreaker, ... }), maxRetries: 0 },
  ],
  tools,
});
await agent.stream(question, { abortSignal: questionSignal }); // cancelling the question aborts its tools
```

Why `maxRetries: 0`: with @mastra/core 1.78.0 a retryable model error (503) is retried about three times inside every fallback attempt, so `maxRetries: 2` meant 9 provider calls and ~15 s before the fallback; a 401 was retried too. The guard throws a non-retryable error after its own bounded attempts, and Mastra moves to the next model immediately.

Breaker: closed → open after N consecutive failures (calls are short-circuited, counted in `shortCircuited`) → half-open after the cool-down (one probe) → closed on success, open again on failure.

Challenge outline: keep one `CircuitBreaker` per dependency in a module-level `Map` (per process), pass it into the run instead of creating it, and test with an injected `now()` that a second run is short-circuited, then advance the clock past the cool-down and let a successful probe close it. Breaker state is about services, not learners, so it contains no tenant data.

Example input: primary outage, flaky tracker, recommendations down. Expected: every answer from the fallback model; tracker recovers on attempt 3; recommendations breaker open; four answered questions.
