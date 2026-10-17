# Proposal

## Why

Real agents serve many users at once, each with their own tone, persona and language. Learners must see how to make instructions per-request with Mastra and why putting per-user settings in shared module state leaks one user's settings into another user's answer under concurrency.

## What Changes

- New lab `lab-16` (Module 04: Agent Configuration and Context). It opens Module 04.
- One shared `Agent` whose `instructions` is a function of the per-call `RequestContext`. Each request carries `{ persona, tone, locale, requestId }`, validated by the agent's `requestContextSchema` (Zod).
- **Parallel requests.** The learner edits 1–4 profiles (JSON). All of them run in parallel (`Promise.all`) against the same agent instance. Per-request workflow steps record start time, finish time and the resolved instructions.
- **Locale-aware facts.** Instructions embed order facts formatted with `Intl` for the request's locale: the delivery date and the total in EUR.
- **Anti-pattern toggle.** The strategy `shared-module-state` reads settings from a variable that every request overwrites before awaiting. The run proves the leak: every request answers as the last profile. The variable is scoped to the run object, so real platform users are never affected.
- **Schema enforcement probe.** One extra call with an invalid locale shows `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED`. It is thrown before any model call, so it costs nothing.

## Capabilities

### New Capabilities

- `course-labs/lab-16-dynamic-instructions`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-16/`. Offline is free. Live mode makes one model call per profile, up to 4.
