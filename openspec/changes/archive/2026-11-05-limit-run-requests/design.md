# Design

## Context

See proposal.md. Express 5.3.0 already sets TRUST_PROXY and authenticates requests before route actions. The run engine limits concurrency and pending approvals, while auth has a separate login limiter. Standard UI and SDK already display canonical retryable API errors; mutations are not automatically retried. No dependency or Mastra API changes are needed.

## Goals / Non-Goals

Provide bounded, deterministic, process-local admission control for authenticated run actions. Preserve existing mutation capabilities and owner checks. Distributed counters, persistent quotas, dollar budgets, parsing quotas and general denial-of-service protection remain separate concerns.

## Decisions

1. Use two independent fixed-window families: start and control (approval plus recovery). Configure RUN_RATE_WINDOW_MS (default 60000), RUN_START_RATE_USER_MAX (30), RUN_START_RATE_IP_MAX (120), RUN_CONTROL_RATE_USER_MAX (60) and RUN_CONTROL_RATE_IP_MAX (240). All values are validated positive bounded integers, with no disable sentinel. Keep default admission controls enabled in all environments; the broad E2E host explicitly sets high test allowances, while dedicated limiter scenarios set low values.
2. One API-owned synchronous limiter checks both owner and network buckets before committing either increment. Denied attempts do not change windows, create entries or spend the other bucket. Successful admission counts attempts even when subsequent input/capability validation fails, avoiding unlimited invalid-action attempts. Authentication and run ownership precede admission; account-header validation precedes capability-recovery admission. No response body or identity is stored in buckets.
3. Use monotonic performance.now with injectable clock for deterministic unit/HTTP tests. Windows begin on first admitted request, expire inclusively and never slide on rejection. Retry-After is the ceiling of the longest blocking wait, at least one second. Responses are no-store, canonical retryable 429 and name only the action family and wait, never which identity exhausted its allowance.
4. Limit the shared table to 10000 owner/network entries (test constructor may use less). Reclaim expired entries on each admission. Do not use LRU eviction: it would let churn reset an active allowance. If new entries do not fit, refuse until enough entries can expire. Known existing buckets remain usable when they have room. Hash namespaced identity keys to avoid retaining raw IPs/subjects. No timers require shutdown cleanup.
5. Normalize IPv4 and mapped IPv4 to one key. Expand valid IPv6 notation and use its first four groups (/64), preventing simple privacy-address rotation from multiplying a subnet's allowance. Invalid or absent addresses share an unknown bucket. Only req.ip (and the existing socket fallback) is used, never a separately parsed forwarding header. Express official proxy guidance and installed types are the compatibility boundary; operators must control forwarding headers when enabling proxy trust.
6. Apply starts after requireAuth, controls after router owner checks, before runner actions. Cancellation, snapshots/listing/SSE, login/logout, progress and static content do not use these buckets. Recovery and decisions share control allowance to bound repeated capability churn. The existing login limiter is unchanged.

## Risks / Trade-offs

- Fixed windows allow bursts around boundaries; retain engine concurrency and approval caps. These are request allowances, not provider spending limits.
- Shared NATs and IPv6 /64s share IP allowance; document sizing for classrooms and keep a larger network default.
- Restart resets local counters and multiple API instances multiply allowance. A shared atomic backend or trusted gateway is required before scaling/public exposure.
- A fully active table temporarily refuses new identities. Expiry permits recovery without sacrificing active limits; document the bounded cap and test it directly.
- JSON parsing and session verification currently precede admission. Body-size caps remain in place; malformed bodies and unauthenticated requests remain the responsibility of existing boundaries and future gateway limits.

## Migration Plan

Deploy additive environment options with conservative defaults and update example/operations docs. Existing HTTP JSON and SDK types remain unchanged; clients already support TOO_MANY_REQUESTS. Rollback restores prior admission behavior without data migration. No data/key/lockfile changes are required.
