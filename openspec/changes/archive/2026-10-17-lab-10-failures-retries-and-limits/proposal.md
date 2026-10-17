# Proposal

## Why

Production agents must survive provider failures without hammering services, burning budget or duplicating side effects. Learners need to see retry decisions made explicitly and deterministically.

## What Changes

- New lab `lab-10` (Module 02) with an explicitly app-level retry policy (`retry.ts`, documented as not a Mastra API): classification (retryable 408/409/425/429/5xx and timeouts; others non-retryable), exponential backoff capped at 4 s with Retry-After precedence, per-attempt timeout, total time budget, max attempts, idempotency gate, and no retries after cancellation.
- Each attempt is a real Mastra `agent.generate` call (agent `maxRetries: 0` so Mastra does not hide attempts); offline fault injection scripts the provider per attempt (503/429/400/slow/Retry-After).
- Scripted model gains an abort-aware `delayMs` per turn.
- The lesson also teaches the native Mastra options (`maxRetries`, model fallback arrays).

## Capabilities

### New Capabilities

- `course-labs/lab-10-failures-retries-and-limits`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-10/`, `packages/mastra-runtime/src/scripted-model.ts` (additive option).
