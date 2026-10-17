# Design

## Decisions

### Capacity

- **Active runs exclude waiting runs.** `activeCount` counts runs that are `running` and have no pending approval. A new `waitingCount` counts runs with at least one pending approval.
- **The cap is checked when a run asks.** `requestApproval` checks `waitingCount >= maxPendingApprovals`, not counting the current run. If the cap is reached, it does not wait. It emits `approval-request` immediately followed by `approval-resolved { decision: "decline", by: "limit" }` and returns that outcome. The learner sees why, and the lab handles it like any decline.
- **Resumed runs can briefly exceed the slot count.** A resumed run re-enters the active set even if that briefly exceeds `MAX_CONCURRENT_RUNS`. Making a human wait for a slot after they approved would be worse UX. The total stays bounded by `maxConcurrentRuns + maxPendingApprovals`.

### Run token

- **Generation and storage.** The runner generates the token with `randomBytes(32).toString('base64url')` at start and keeps it on the run record. `start()` returns `RunSnapshot & { runToken }`. `get()` and the snapshot never include it.
- **Checking.** `runner.authorize(runId, token)` throws `NOT_FOUND` for an unknown run first, then `FORBIDDEN` for a mismatch, using `timingSafeEqual` on equal-length buffers. The API calls it before cancel and approval decisions.
- **Trusted in-process callers.** Engine methods (`cancel`, `resolveApproval`) stay token-free for trusted callers such as tests, live tests and shutdown. Authorization is an API-boundary concern.
- **Header.** Clients send `X-Run-Token`. A header rather than the body means it is never echoed and fits the cancel route, which has no body. The request logger does not log headers.
- **Read endpoints.** They stay keyed by run id. Events can't contain secrets (they are redacted), and making the events stream depend on the token would need `fetch`-only clients. Our client already uses `fetch`, but other tooling (curl, Studio-like viewers) benefits from open reads. This is documented as a known trade-off.

### Web

- The token is kept in a ref of the run hook, never in localStorage or the URL, and is discarded on reset or a new run.

## Risks

- **Lost token.** If a browser reload loses the token, the learner can no longer cancel or approve that run. It then ends by the approval timeout or the disconnect grace, which is the same as closing the tab today.
