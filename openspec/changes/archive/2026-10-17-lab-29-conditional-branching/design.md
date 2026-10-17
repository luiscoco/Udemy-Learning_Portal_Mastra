# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike, `.branch([[predicate, step], …])`):

- **All predicates are evaluated, in order, for every run.**
- **Every matching branch runs.** With the predicates `>=4`, `>=3` and `>=1`, severity 5 ran all three steps, and the result was `{ 'page-oncall': …, 'priority-queue': …, 'standard-queue': … }`.
- **No match "succeeds" silently.** `status: success` with `result: {}`, and no step runs.
- **The next step gets the keyed object.** A step after `.branch()` receives `{ <stepId>: output }` for the branches that ran, or `{}`.
- **`stepExecutionPath` is empty** for branch-only workflows. The executed branches appear in `steps`.

## Decisions

- **Predicates come from one route table** (`ROUTES`), each with an explicit range. Mutual exclusivity is unit-tested over the whole severity domain (0–4): exactly one route matches each value. The `manual-review` predicate is defined as `!ROUTES.some(r => r.matches(s))`, so it can never overlap.
- **`finalize` makes the outcome explicit.**
  - One key: a typed routing record `{ route, queue, slaMinutes, actions }`.
  - Zero keys: `UNROUTED`.
  - More than one key: `AMBIGUOUS_ROUTE`.

  This turns Mastra's silent behaviour into data the lab can check.
- **Batch execution.** Each ticket runs as its own workflow run, sequentially, with `workflow-step` events per ticket (tagged through `workflowId` = `routing-workflow#<ticketId>`). The batch is bounded at 1–8 tickets.
- **Severity in live mode.** Tickets may carry an explicit `severity` (pre-assessed), which skips the model. That keeps live expectations stable, while assessed tickets still show the agent at work. The example mixes both.

## Risks

- **Live assessment may disagree** with `expectRoute` for borderline texts. The example's assessed tickets are unambiguous. A mismatch is reported per ticket rather than hidden.
