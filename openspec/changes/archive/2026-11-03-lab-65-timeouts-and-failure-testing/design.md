# Design

## Files (`packages/labs/src/lab-65/`)

- **`resilience.ts`:**
  - **`CircuitBreaker({ name, failureThreshold, coolDownMs, now })`** has states `closed`, `open` and `half-open`.
    - `allow()` returns false while open, or turns half-open once the cool-down has passed; only one probe is allowed at a time.
    - `success()` closes the breaker; `failure()` counts consecutive failures, opens at the threshold, and re-opens on a failed probe.
    - `transitions[]` records `{ from, to, atMs, reason }`.
  - **`resilientCall(dep, attemptFn, { attempts, timeoutMs, baseDelayMs, breaker, signal, onAttempt })`:**
    - for each attempt: check the breaker; create an attempt `AbortController` linked to the caller's signal; race `attemptFn(signal)` against the timeout, which aborts the attempt; classify the failure;
    - only retryable failures (5xx, 429, timeout) are retried, with full-jitter-free exponential backoff (deterministic) that the signal can interrupt;
    - returns `{ ok, value? , outcome, attempts }`. A caller abort ends with `cancelled`, with no further attempts.
  - **`isRetryable(err)`:** HTTP status 408/429/5xx or a timeout.
- **`model-guard.ts`:** `guardModel(inner, { dep, fault, attempts, timeoutMs, breaker, log })` is a `LanguageModelV2` proxy.
  - `doGenerate` and `doStream` go through `resilientCall`; the fault is injected inside the attempt before the inner call.
  - On final failure it throws `{ isRetryable: false, statusCode }`, so Mastra's fallback entry (`maxRetries: 0`) moves on immediately.
- **`tools.ts`:**
  - `createDeskTools({ faults, deps, signalFor, record })` builds `lookupOrder`, `trackShipment` and `getRecommendations` with `createTool`.
  - Each tool calls `resilientCall` with the question's signal (the tool's `abortSignal` is linked as well) and returns `{ ok: true, … }` or `{ ok: false, degraded: true, reason }`.
- **`run.ts`:**
  - For each question: a question `AbortController` linked to `ctx.signal`, and an optional scheduled cancel.
  - An `Agent` with `model: [{ model: guard(primary), maxRetries: 0 }, { model: guard(fallback), maxRetries: 0 }]` and the tools; `streamAgent` runs it with `abortSignal: question.signal`. A question that is cancelled or fails records its outcome, and the loop continues.
  - Outputs: `questions[]`, `calls[]` (one row per attempt), `breakers`, `bounds`, `answeredBy`.

## Offline script

The same script runs for primary and fallback:

- **turn 1:** the tools a question needs (`lookupOrder` + `trackShipment` for "where", `getRecommendations` for "suggest");
- **turn 2:** an answer that states degraded parts honestly.

## Checks

| Check | Passes when |
| --- | --- |
| `retries-bounded` | Attempts per call ≤ `maxAttempts`; non-retryable faults are attempted once. |
| `timeouts-enforced` | No attempt lasted longer than its timeout + 2 s slack. |
| `failing-dependency-isolated` | A failing dependency's breaker opened, later calls were short-circuited, and every non-cancelled question was answered. |
| `fallback-model-used` | The answering model matches the primary fault. |
| `cancellation-propagates` | The cancelled question's calls ended `cancelled` or never started after the cancel, and later questions were answered. |
| `no-hang` | Every call is terminal, and the run duration ≤ the computed bound. |
