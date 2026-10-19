# Proposal

## Why

L51–L53 let agents drive parts of the control flow. Production pipelines often need the opposite: the order of work fixed in code, every hand-over typed and validated, and failures contained so that one agent's outage cannot crash the run or leak bad data downstream.

The DoD asks for typed workflow steps that orchestrate at least three agents deterministically, with error boundaries, a stable step trace and retry behavior.

## What Changes

- **New lab `lab-54`** (Module 11): an incident-response workflow `incident-workflow` with five typed steps and three Mastra `Agent`s:
  1. `extract` (agent **extractor**, structured output `Incident { service, severity, symptoms, customerImpact }`);
  2. `fetch-logs` (deterministic, no agent: reads the fixture logs of the extracted service);
  3. `diagnose` (agent **diagnostician**, structured output `Diagnosis { likelyCause, confidence, evidence }`, where evidence must be ids of the fetched log lines);
  4. `communicate` (agent **communicator**, a status-page update validated for length, service name and no internal log ids);
  5. `assemble` (deterministic: final status `complete`, `degraded` or `failed-safe`).
- **Typed boundaries.** Every step has Zod input and output schemas, and every agent result is validated by the app before it is passed on, because Mastra validates step inputs but not step outputs.
- **Retries.** Agent steps use `createStep({ retries: stepRetries })` with an exponential backoff inside the step (100 ms, 200 ms, …). Each attempt is recorded and streamed by the lab, since Mastra streams one start/result pair for the whole series.
- **Error boundaries.** An agent step returns `Result<T> = { ok: true, value } | { ok: false, error }` on its last attempt instead of throwing:
  - diagnosis failure → `degraded`: the communicator writes a "cause under investigation" update;
  - extraction failure → `failed-safe`: later agents are skipped, nothing is published, and the case goes to a human.
- **Faults** (both modes, simulated at the step boundary and labelled): `invalid-extraction` (the first extraction is corrupted in transit, so validation fails), `transient-diagnosis` (two simulated 503s, then success), `permanent-diagnosis`, `extract-down`.
- **Stable trace.** The workflow runs `repeatRuns` times (default 2) on the same input. The trace signature (step, status, attempts, ok) must be identical across runs.
- **Transcript.** It reuses `output.agentConversation`.
- **Checks:** `agents-coordinated`, `typed-boundaries`, `retry-behavior`, `error-boundaries`, `stable-trace`.

## Capabilities

### New Capabilities

- `course-labs/lab-54-coordinated-agent-workflow`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-54/`, catalog flag, registry, COMPATIBILITY row, an e2e spec.
- **Modes:** offline (scripted, free) and live (three agent calls per run plus retries, times `repeatRuns`).
