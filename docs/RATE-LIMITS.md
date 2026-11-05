# Run request limits

The API admits a bounded number of requests in each window for both the authenticated subject and the client network. Run starts have their own family; approval decisions and run-capability recovery share a second family. Limits apply across labs, run IDs, tabs and login sessions for the same verified account. These are application-level controls; no Mastra dependency or provider configuration changes.

| Setting | Default | Allowed range |
| --- | --- | --- |
| `RUN_RATE_WINDOW_MS` | 60000 | 1000–3600000 |
| `RUN_START_RATE_USER_MAX` | 30 | 1–100000 |
| `RUN_START_RATE_IP_MAX` | 120 | 1–100000 |
| `RUN_CONTROL_RATE_USER_MAX` | 60 | 1–100000 |
| `RUN_CONTROL_RATE_IP_MAX` | 240 | 1–100000 |

A window begins with the first admitted request in that bucket. Both buckets must have room before either is charged. A rejected attempt does not extend the window or spend the other allowance. Admitted attempts count even if input or capability validation subsequently fails. Existing authentication and run-owner checks precede admission; other learners still receive 404 and anonymous callers 401. Run recovery also checks its expected account header first.

HTTP 429 uses the existing `TOO_MANY_REQUESTS` JSON error with `retryable: true`, a wait message and integer `Retry-After` seconds, rounded up for every blocking bucket. The client displays the error and lets the learner retry deliberately. Run actions are not automatically retried. Cancellation is exempt so a throttled learner can still stop work with the valid run capability. Snapshots, recent-run listing, SSE, progress, login/logout and static content do not use these allowances. Login retains its independent limiter.

The local table holds at most 10000 hashed account/network keys across both families. Expired entries are reclaimed on admission. Active entries are never evicted; if another identity would overflow capacity, it receives 429 until sufficient entries can expire. Only counters and monotonic deadlines are retained, with no raw subjects, addresses, input bodies or capability values. No background cleanup timer is required.

Client addresses come from Express `req.ip` under the existing `TRUST_PROXY` setting. With the default `false`, changing X-Forwarded-For cannot change the socket client's bucket. IPv4 and mapped IPv4 share a bucket; IPv6 clients share their /64. Size the network allowance for shared classroom/NAT networks. When enabling proxy trust, ensure the trusted proxy removes or overwrites client forwarding headers and that every route to the API matches that trust policy. See the [official Express proxy guide](https://expressjs.com/en/guide/behind-proxies/).

These counters are local to one API process and reset on restart. Multiple instances multiply the allowance; production scaling requires a shared atomic admission backend or a properly configured gateway. Fixed windows permit a burst on either side of an expiry boundary. Keep engine concurrency, pending-approval, timeout and body-size caps. These limits do not implement dollar budgets, upload/voice quotas, unauthenticated flood protection or arbitrary public-host safety. Body parsing and session verification currently happen before admission.

## Demo

On a separate local test API, set `RUN_START_RATE_USER_MAX=1` and `RUN_CONTROL_RATE_USER_MAX=1`. Sign in and open `/labs/lab-15?tab=run`, select the interactive approval scenario and run it. Reload once to recover its capability, consuming the control allowance. An immediate Approve request shows the retryable limit message while the approval remains pending. Cancel still stops the run. A second Run request shows the start-limit wait message; retry deliberately after the indicated window. Restore your intended allowances after this demonstration.

The dedicated offline desktop/mobile scenario (`npm run test:e2e -- e2e/run-rate-limits.spec.ts`) uses a separate child API and real 429 responses, with one allowed start and one allowed control request. It checks accessible errors, no automatic mutation retries, unchanged approval state, cancellation, replay and no extra execution. The broad catalog suite explicitly uses higher allowances to exercise every lab without testing throttling accidentally. Normal API defaults remain enabled.
