# Proposal

## Why

Agents depend on things that fail: models time out, rate-limit or go down, and tools hang or fail now and then. The L65 DoD: no hung UI, bounded retries, and a failing dependency isolated. L10 taught retry classification for a single call. L65 adds the boundaries a whole agent needs across many calls.

Spikes with @mastra/core 1.78.0 found two reasons the native fallback is not enough on its own:

- **Retries multiply.** For a retryable error (503), each fallback entry retries `maxRetries` times, and every attempt is itself retried 3 times inside. With `maxRetries: 2` that is 9 provider calls in about 15 s before the fallback. A non-retryable 401 is still retried `maxRetries` times. Call-level `modelSettings.maxRetries` does not change this.
- **An aborted slow model ends the whole stream.** It does not fall back.

A model wrapper that owns attempts and per-attempt timeouts, throws non-retryable errors, and uses `maxRetries: 0` entries made the native fallback immediate: 2 primary calls and the fallback in 65 ms. It also works live with `ModelRouterLanguageModel`.

## What Changes

- **New lab `lab-65` (Module 13): a resilient support desk** answering a queue of customer questions (default 4).
- **Dependencies:**
  - the model, a primary and a fallback in Mastra's native fallback array (`[{ model, maxRetries: 0 }, …]`), each wrapped by `guardModel`;
  - tools `lookupOrder` (reliable), `trackShipment` and `getRecommendations`.
- **Fault injection (inputs):**
  - primary model: `none` | `outage` (503) | `rate-limit` (429) | `slow` (hangs) | `bad-key` (401, non-retryable);
  - tracker: `none` | `flaky` (first 2 calls fail with 503) | `slow` (hangs);
  - recommendations: `none` | `down`;
  - optional cancellation of one question mid-flight (the customer closes the chat).
- **Boundaries (app-level, documented as such):**
  - **per-attempt timeout**, which aborts the in-flight call through its `AbortSignal`;
  - **bounded retries** with exponential backoff, only for retryable failures (5xx, 429, timeout), and never for 401 or 400;
  - a **circuit breaker** per dependency (closed → open after N consecutive failures → half-open probe after a cool-down → closed or open), which short-circuits calls while open;
  - **isolation:** a tool that fails or is short-circuited returns a degraded result, so the agent answers the rest, and later questions continue. A cancelled question aborts only its own calls.
- **No hung UI:**
  - every attempt emits start and finish workflow steps with durations;
  - every call ends with a terminal outcome (`ok`, `failed`, `timeout`, `short-circuit` or `cancelled`);
  - the run has a computed worst-case bound under the runner deadline;
  - the Run tab's Stop works mid-wait (e2e).
- **Offline:** scripted models and fault injection. **Live:** real primary and fallback models, with faults injected by the wrapper before the provider call (so an injected outage costs nothing).
- **Tests:**
  - breaker state machine with an injected clock;
  - backoff and retry bounds;
  - wrapper timeout and abort;
  - each fault fixture;
  - cancellation of one question;
  - runner cancel;
  - e2e (happy path and Stop);
  - live.
- **Docs:** a COMPATIBILITY row on fallback retry amplification and abort behaviour.
