# Design

## Context

A run is one server-side async task streaming SSE until `complete`. Lab 15 already resumes Mastra in memory (`approveToolCall` / `declineToolCall`) inside that task, so an interactive decision only needs the task to await a promise that a separate HTTP request settles. Mastra's own run snapshot stays in the in-memory store for the lifetime of the task.

## Decisions

- **Engine-level primitive, not lab-specific.** `ctx.requestApproval()` returns `Promise<{ decision, reason?, by }>`. The runner owns:
  - the pending map,
  - the events: it emits `approval-request` on entry and `approval-resolved` on settle,
  - the timeout,
  - abort wiring.
  Labs can't forget to emit or clean up.
- **Deadline paused while waiting.** Human think time must not burn the run's execution budget. The runner tracks the remaining budget, clears the deadline timer at the first pending approval and re-arms it with the remaining time when the last one settles. `ctx.deadline` becomes a getter reflecting this.
- **Bounded waits.** `approvalTimeoutMs` (runner option, default 300 000; API config `APPROVAL_TIMEOUT_MS`). Expiry resolves as `decline` with `by: 'timeout'`. It is fail-safe: the side effect does not run.
- **Abort still wins.** Cancel, disconnect grace and dispose reject the wait with the run's abort reason, so a waiting run ends `cancelled`, as today.
- **Idempotent decisions.** The first decision wins. A second POST gets 409 `CONFLICT`, as does a POST after the run has finished. An unknown run gets 404.
- **No new auth.** The run id is an unguessable UUID, the same trust model as cancel and events. The platform is single-learner; multi-user auth is out of scope and documented.
- **UI.** The approval panel is derived from events (`approval-request` without a matching `approval-resolved`), so a reconnect replay restores it. Buttons are disabled while posting, and errors are shown inline without ending the run. Status text "Waiting for your approval…" is announced through the existing polite live region.
- **Lab 15 keeps presets.** Conformance, fixtures and the e2e happy path run `exampleInput` unattended, so the example stays `approve`. `ask` is the interactive option, covered by its own engine, lab and e2e tests.

## Risks

- A learner who leaves the tab open without answering holds a concurrency slot for up to the approval timeout. This is mitigated by the timeout and `MAX_CONCURRENT_RUNS`.
