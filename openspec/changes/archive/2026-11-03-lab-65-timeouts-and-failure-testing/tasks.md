# Tasks

- [x] resilience.ts: CircuitBreaker, resilientCall, isRetryable, backoff; unit tests with an injected clock
- [x] model-guard.ts: LanguageModelV2 proxy with fault injection; tests for timeout, abort and non-retryable fallback
- [x] tools.ts with degraded results and per-question signals
- [x] run.ts: question queue, native fallback array, cancellation of one question, outputs and checks
- [x] definition, fixtures, solution; register in index and catalog
- [x] lab65 tests (each fault, cancellation, runner cancel), e2e (happy path and Stop), live check
- [x] COMPATIBILITY row; fill the new spec Purpose after archive; npm run verify, e2e, live
