# Design

## `workflows.ts`

`build(settings, model)` creates an `emailWriter` Agent with these instructions:

> Write the body of a shipping notification email in two short sentences. Mention the tracking id exactly as given. No greeting placeholders.

The shipping workflow is `bookCourier` (outputs `{ trackingId }`) → `prepareEmail` (outputs `{ prompt }` with the tracking id and order value) → `createStep(writer)` → `notifyCustomer` (receives `{ text }` and outputs `{ ok, email }`).

With `failStep === 'emailWriter'`, the writer's model is a proxy whose `doStream` and `doGenerate` reject with HTTP 503, so the provider is never called.

## `run.ts`

- `resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId, offline: emailScript })`. The offline script produces a two-sentence draft that mentions the tracking id found in the prompt.
- `setResultExtras({ effective: { mode, modelId, simulated } })`.
- The output gains `agentSteps` (from `streamWorkflow`) and `simulated`.

## `streamWorkflow`

In `case 'workflow-step-output'`, when `payload.output.from === 'AGENT'`:

- `text-delta`: emit a token event and append to the agent step's text;
- `step-start`: record `modelId` and `provider`.

The node id is resolved after the run as the reported step id whose last segment equals `stepName`.

## Check `agent-step-reflected`

The node `shipping.emailWriter` exists with kind `step`, and its status equals Mastra's.

- **When it succeeded:** the token text equals the recorded text and contains `TRK-5521`. In live mode, the provider is not `offline-sim`.
- **When it failed:** no draft was produced.
- **When it was never reached:** nothing more to check.
