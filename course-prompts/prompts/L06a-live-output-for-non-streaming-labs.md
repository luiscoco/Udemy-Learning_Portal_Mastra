# L06a — Live output for non-streaming labs

**Module:** 02 Agent Generation and Streaming · **Step 12 of 91** · **OpenSpec change:** `fix-live-output-non-streaming`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L06](L06-basic-text-generation.md) · Next: [L06b](L06b-actionable-model-provider-errors.md)

## Copy-ready prompt

Implement platform follow-up L06a — "Live output for non-streaming labs".

Why: labs that call agent.generate() return the whole answer at once and emit no token events, so a Run-tab "Live output" panel that only shows streamed tokens stays empty and learners report missing output.

Requirements: Live output shows streamed tokens when there are any. When a run finishes without tokens and its result has a top-level text or answer string, show that complete answer with a note that it was not streamed. Otherwise, after the run, say that no tokens were streamed. Before a run, the placeholder explains both behaviours. Web-only change: no contract or API change.

Definition of done: a unit test for the run state and an e2e test show a non-streaming lab's complete answer and a streaming lab's tokens.

First create an OpenSpec change named fix-live-output-non-streaming with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
