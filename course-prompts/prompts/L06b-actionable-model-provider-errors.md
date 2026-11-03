# L06b — Actionable model provider errors

**Module:** 02 Agent Generation and Streaming · **Step 13 of 92** · **OpenSpec change:** `fix-provider-error-mapping`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L06a](L06a-live-output-for-non-streaming-labs.md) · Next: [L07](L07-behavior-and-instruction-variants.md)

## Copy-ready prompt

Implement platform follow-up L06b — "Actionable model provider errors".

Why: from L06 on, labs call real providers in live mode. A rejected API key (HTTP 401), a rate limit (429) or an outage (5xx) otherwise reaches the learner as a generic INTERNAL "Lab execution failed", which nobody can act on.

Requirements: in the engine's canonical error mapping, recognise model provider API errors (the AI SDK APICallError carries statusCode; also look inside cause, lastError and errors[] of retry wrappers, a few levels deep). Map 401/403 to NOT_CONFIGURED ("check the key in the server .env"), 429 to a retryable TOO_MANY_REQUESTS, 408 and 5xx to a retryable PROVIDER_ERROR, and other 4xx to a non-retryable PROVIDER_ERROR. Use fixed messages: never copy the provider's text, which can echo request data. Keep every existing mapping and the INTERNAL fallback for unknown errors.

Definition of done: unit tests cover 401, 403, 429, 408, 503 nested in a retry wrapper, 400 and a non-HTTP error; a live run with an invalid key reports NOT_CONFIGURED with the actionable message.

First create an OpenSpec change named fix-provider-error-mapping with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
