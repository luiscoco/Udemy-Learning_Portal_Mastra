# Design

## Context

Already verified (COMPATIBILITY rows for L09, L26, L33 and L34, `@mastra/core` 1.78.0):

- `createStep({ retries: n })` retries a throwing step up to n times. The step receives `retryCount` 0…n. **The stream shows one start/result pair for the whole series**, and exhausted retries fail the step and the workflow.
- Mastra validates workflow and step **input** at runtime but not step **output**.
- `structuredOutput` with the default strict strategy throws `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` on invalid output, which triggers a step retry.
- `.dountil()` leaves `stepExecutionPath` empty (L51); this lab has no loop, but it still derives the trace from the streamed steps for consistency.

## Decisions

- **Schemas** (`schemas.ts`):
  - `Incident { service ∈ checkout | search | auth | payments, severity ∈ sev1 | sev2 | sev3, symptoms: string[1..5], customerImpact }`;
  - `LogLine { id: L\d+, at, level, message }`;
  - `Diagnosis { likelyCause, confidence ∈ low | medium | high, evidence: string[1..4] }`;
  - `Result<T>` = `{ ok: true, value, attempts } | { ok: false, error: { code, message }, attempts }`;
  - `PipelineState` carries the results forward step by step.
- **Boundary** (`boundary.ts`): `runBoundary({ stepId, retryCount, maxRetries, critical, attempt })`.
  - It sleeps `100 × 2^(retryCount−1)` ms before a retry (abort-aware).
  - It runs the attempt, validates the value with the step's schema and records `{ attempt, ok, code, durationMs, backoffMs }`.
  - On failure it rethrows while `retryCount < maxRetries` (Mastra retries). On the last attempt it returns `{ ok: false }`.
  - An aborted run is always rethrown.
- **Extra validation.** Diagnosis evidence must be a subset of the fetched log ids (`EVIDENCE_NOT_IN_LOGS`). The update must be at most 600 characters, mention the service, and contain no `L\d+` log ids (`UPDATE_INVALID`).
- **Faults** (applied inside the step, so they behave the same offline and live; marked `simulated` in the attempt record):
  - `invalid-extraction`: attempt 0 corrupts `severity` to `urgent!!` before validation.
  - `transient-diagnosis`: attempts 0 and 1 throw `PROVIDER_503`.
  - `permanent-diagnosis`: every attempt throws `PROVIDER_503`.
  - `extract-down`: every extraction attempt throws `PROVIDER_503`.
- **Dependencies.** `diagnose` and `communicate` skip, with `{ ok: false, error: { code: 'SKIPPED_UPSTREAM' }, attempts: 0 }`, when the extraction failed. `communicate` writes from the typed incident and either the diagnosis or `null` (degraded).
- **Assemble.** `complete` when all three results are ok; `degraded` when the incident and update are ok but the diagnosis is not; `failed-safe` when the extraction failed (no update published). An `escalation` message goes to a human for `degraded` and `failed-safe`.
- **Repeat runs.** The lab creates a fresh `createRun()` per repetition, with fresh fault counters and attempt records. `signature(run)` = steps in streamed order with `status`, `attempts` and `ok`. The live-mode caveat (model wording can differ between runs) does not affect the signature, which is structural.
- **Live finding (gpt-5-mini).** The first live updates invented remediation steps that were not in the input ("We are rolling back the deploy", "throttling retries"). The communicator instructions now say to state only facts from the given incident and diagnosis. Later live updates stayed factual, but this cannot be checked deterministically, so it remains a prompt-level control.
- **Offline scripts.** The extractor maps keywords to service and severity and splits sentences into symptoms. The diagnostician picks the log lines with error, timeout or exhausted and names the first as the cause. The communicator uses a template with the service, severity, first symptom and cause, or "cause under investigation".
