# Design

## Decisions

- **App-level policy, clearly labelled.** Mastra's `maxRetries` and fallback arrays exist but do not expose per-attempt decisions; the lab needs visible, testable decisions. The lab sets `maxRetries: 0` on its agent so attempts are not hidden.
- **Pure core with injected clock/sleep** (`retryWithBackoff(fn, policy, signal, hooks)`): unit tests use a virtual clock, so counts and waits are asserted exactly without real sleeping.
- **Budget rule**: stop if `elapsed + nextWait + perAttemptTimeout > totalBudget` — conservative, guarantees the budget is never exceeded.
- **Verified gotcha**: an aborted `agent.generate()` resolves with empty text; the attempt function checks `attemptSignal.aborted` and throws so timeouts are classified correctly.
- No jitter by default (determinism); jitter is the lesson challenge.
