# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike, `.foreach(step, { concurrency })`):

- **Concurrency is honoured.** With `concurrency: 2`, five items of 100 ms ran with a peak of 2 in flight and took about 300 ms.
- **The output order equals the input order** even when items complete out of order (completion order b, d, c, a gave the result a, b, c, d).
- **An empty array succeeds.** The foreach output is `[]` and the next step runs.
- **One thrown item fails the whole foreach step and the workflow.** Items already in flight still finish, but the step record carries no output, so successful results are lost. The next step does not run.
- **Progress per iteration.** Each item emits a `workflow-step-progress` chunk `{ id, currentIndex, completedCount, totalCount, iterationStatus, iterationOutput? }`.
- **Invalid array input throws** `Invalid input data` from `start`/`stream` before any item runs. The lab validates the batch with Zod first, so learners get field-level errors.

## Decisions

- **Partial failure as data.** The item step catches its own errors and returns a discriminated union. That is the only way to keep the successful results, because Mastra has no "continue on item error" option for foreach in this version.
- **Measured, not claimed, concurrency.** The step increments and decrements a counter scoped to the workflow instance. The peak is reported and checked against the configured limit. Offline, each item waits for a learner-set simulated latency, which is labelled as simulated.
- **Order is checked.** Result `docId`s are compared with the input `docId`s.
- **Bounds.** The batch holds 0–12 documents (duplicate `docId`s rejected), each up to 4,000 characters. Concurrency is 1–4.
- **Batch status.** `empty` (0 documents), `complete`, `partial` or `all-failed`. A batch of zero is a valid, explicit outcome, not an error.

## Risks

- **Live summaries vary.** Checks assert structure (summary present, keywords at most 5), never wording.
