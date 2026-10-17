# Design

## Decisions

- Verified in L11's spike: Mastra validates tool args against `inputSchema` and returns `{ error: true, message: "Tool input validation failed…" }` as the tool result without calling `execute`. L12 relies on that and proves it with a counter.
- The tool is created per run (closure counter) so concurrent runs cannot interfere.
- Learner-facing field errors are computed with the same schema (`safeParse` issues with paths); the Mastra message is also surfaced for comparison.
- Live mode: real models may rewrite arguments, so the non-execution check uses the invariant "execute count = accepted calls" and the Mastra-agreement check is relaxed.
