# Proposal

## Why

L68 was offline only: every workflow step simulated business logic, so a "live" run would have behaved exactly like the offline one. The owner asked for a meaningful live scenario before L69. A spike with @mastra/core 1.78.0 showed that Mastra's native agent step fits the graph and the event stream:

- `createStep(agent)` takes `{ prompt }` and returns `{ text }`. It serializes as `{ type: 'agent', id, agentId }`.
- Inside the nested workflow, the run stream reports it as `shipping.emailWriter`.
- The agent's own stream arrives as `workflow-step-output` chunks: `{ stepName, output: { from: 'AGENT', type } }`. `text-delta` carries the tokens, and `step-start` carries `modelId` and `provider`.

## What Changes

- **Workflow.** The nested shipping workflow becomes `bookCourier → prepareEmail → emailWriter (native agent step) → notifyCustomer`. The agent drafts the shipping email from the order value and tracking id. Offline, a scripted model writes it; live, the learner's chosen model writes it.
  - The model is resolved with `ctx.services.models.resolve`, so the existing key and model checks and the simulated flag apply.
  - The fault `emailWriter` fails the model call before the provider is reached, so it costs nothing live.
- **`shared/workflow-stream.ts` (additive).** Agent `text-delta` output becomes token events, so the draft streams into Live output. Each agent step's model id, provider and text are recorded in `WorkflowRunResult.agentSteps`. No existing lab uses agent steps, so nothing else changes.
- **Lab 68:**
  - modes become offline and live, with a `modelId` input and a cost notice;
  - `failStep` gains `emailWriter`;
  - a new check, `agent-step-reflected`: the agent node's status matches Mastra; when it succeeds, the streamed tokens equal the drafted text, which mentions the tracking id; in live mode the provider is a real one, not the offline simulator;
  - the result extras report `simulated` honestly.
- **Tests:** lab68 updated (13 nodes; agent node, tokens and failure); the live suite runs lab-68 automatically; the e2e visualizer spec checks the agent node and the streamed draft.
