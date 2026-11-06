# Optional live checkpoint

The practical exercise in this lesson runs real local code, a declared fixture or recorded teaching data. Offline runs it without an AI-provider charge. Live runs the same exercise and then asks a real model a lesson-specific question using at most 6,000 characters of its redacted result.

Select Live deliberately. The server must allow live mode and hold a provider API key. Use `auto` for a configured model (preferring the scaffold's selected provider when possible, otherwise Anthropic then another configured provider), or enter an enabled `provider/model` ID from LIVE_MODELS. The browser never holds keys.

Read `liveCheckpoint.answer` and the `live-checkpoint` workflow step. The result identifies the model and reports generation usage. One generation step is allowed, with no tools, no automatic provider retry and at most 2,048 output tokens. The run timeout and Cancel apply to the provider call. A provider error or empty answer fails explicitly; no mock response substitutes for a live answer.

Provider usage is billed to your API account. A bounded excerpt can contain the learner text or document data used in this exercise; do not use confidential data. Known server secrets are masked before the excerpt is sent. The response is an explanation to review, not proof that a remote Studio, MCP server or cloud deployment was contacted. The new objective check establishes successful completion and a nonempty answer, not semantic correctness. Existing practical checks still apply.

This is an application-level teaching adapter built on the installed Mastra Agent API, not a new native Mastra feature. See shared/live-checkpoint-definition.ts for the exact question used by this lesson and shared/live-checkpoint.ts for the implementation.
