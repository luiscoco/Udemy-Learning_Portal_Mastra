# Proposal

## Why

Run concurrency and approval caps do not limit repeated short executions or decision/recovery requests. The next release gate is bounded request admission per authenticated learner and client network address.

## What Changes

- Add configurable per-learner and per-IP limits for run starts, and a separate shared family for approval decisions and capability recovery.
- Return canonical retryable 429 errors with a bounded wait message and Retry-After. Reject before starting code, settling an approval or rotating a capability.
- Keep cancellation, reads, SSE and authentication behavior available independently of these limits. Preserve owner checks and existing route/SDK contracts.
- Bound local limiter state, fail closed at capacity, reclaim expired windows and document proxy trust, IPv6 grouping, restart behavior and single-process limits.
- Verify deterministic clock/capacity behavior, HTTP isolation and SDK error propagation, and browser feedback plus cancellation after throttling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-execution`: request admission limits with owner isolation, safe retry feedback and unaffected cancellation/replay.

## Impact

Express API middleware/routes, deployment configuration and examples, SDK regression tests, offline browser scenarios and operations documentation. No Mastra/package upgrades or provider calls. Limiter state is process-local; distributed quotas, provider dollar budgets, upload/voice quotas and public deployment remain separate milestones.
