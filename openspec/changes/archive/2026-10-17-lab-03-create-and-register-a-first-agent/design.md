# Design

## Decisions

- **Real Mastra classes offline**: `ScriptedLanguageModel` implements `LanguageModelV2` (verified accepted by `Agent.model` in the spike test), so the actual Mastra agent loop runs; only the network call is replaced.
- **ModelService** lives in `@mlp/labs` services: `resolve({ mode, modelId, offline })`. Live ids come from `LIVE_MODELS` (default: `openai/gpt-5-mini`, `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, `google/gemini-2.5-flash`), validated against the installed registry; key presence is checked via the provider's env var names, values never copied.
- **Lookups as tool events** so the timeline shows `mastra.getAgent` and `mastra.getAgentById` with their results.
- **Instructions check** compares the scripted model's recorded system prompt; in live mode it is reported as not observable rather than faked.
- **Cancellation**: `ctx.signal` passed as `abortSignal` to `generate`.

## Risks / Trade-offs

- [Live answers vary] → checks never depend on live text content.
