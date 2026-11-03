# L68a — A real model step in the visualized workflow

**Module:** 14 Full-Stack AI Applications · **Step 85 of 92** · **OpenSpec change:** `lab-68-live-agent-step`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L68](L68-workflow-visualizer.md) · Next: [L69](L69-voice-assistant.md)

## Copy-ready prompt

Implement follow-up L68a — "A real model step in the visualized workflow" for Lab 68.

Why: if every step of the visualized workflow only simulates business logic, a live run behaves exactly like an offline one and the lab has no meaningful live scenario.

Requirements:
- Add a native Mastra agent step to the nested shipping workflow: a step that builds { prompt } from the tracking id and order value, then createStep(agent) (it takes { prompt } and returns { text }), then the step that sends the email. Offline a scripted model drafts the email; live the learner's chosen model does (resolve it through the platform's model service so keys, allowed models and the simulated flag apply).
- In the workflow streaming helper, forward the agent's own stream (workflow-step-output chunks with from: 'AGENT'): text-delta → token events for Live output; step-start → record modelId and provider. Keep it additive for other labs.
- Add a fault that fails the model step before the provider is called (no live cost), live mode with a model select and a cost notice, and a check that the model node's status matches Mastra, that the streamed tokens equal the draft, that the draft quotes the tracking id, and that a live run used a real provider.

Definition of done: offline and live runs pass all checks; the agent node shows in the graph with its live status; a failing model step marks the node failed and the next step not reached; the live check records the real provider.

First create an OpenSpec change named lab-68-live-agent-step with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
