# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike, offline and live):

- **Capabilities from the registry.**
  - `modelSupportsTemperature`: gpt-5-mini false; gpt-4o-mini, claude-haiku-4-5 and gemini-2.5-flash true.
  - `getModelReasoningOptions`:
    - gpt-5-mini `[{ type: effort, values: [minimal, low, medium, high] }]`
    - gpt-4o-mini `[]`
    - claude-haiku-4-5 `[{ type: budget_tokens, min: 1024 }]`
    - gemini-2.5-flash `[toggle, budget_tokens 0–24576]`
- **Options reach every call.** `generate(prompt, { modelSettings: { temperature, maxOutputTokens, topP }, providerOptions })` reaches every model call (seen in `LanguageModelV2CallOptions`).
- **Step limit.** `maxSteps: 3` stops a 10-call tool loop after three steps with `finishReason: tool-calls` and empty text.
- **Per-call timeout.** `modelSettings.timeout.stepMs: 100` on a 500 ms call throws `MastraTimeoutError` ("Model call timed out after 100ms").
- **Reasoning effort is real.** Live `providerOptions.openai.reasoningEffort` changed reasoning tokens from 0 (`minimal`) to 448 (`high`) for the same prompt.
- **Token limit.** Live `maxOutputTokens: 16` returned empty text with `finishReason: length`.
- **Silently ignored temperature.** Temperature 0.2 on gpt-5-mini returned normally, with no error and no warning.
- **Unused option.** `modelSettings.reasoning` is documented as a no-op on the V2/V3 provider adapters, so the lab uses `providerOptions` instead.

## Decisions

- **Conditional visibility is generic and additive.**
  - The condition compares the string form of another field's raw value, which covers select and boolean fields.
  - The definition schema rejects references to unknown fields, references to later fields, and self-references.
  - Hidden fields are omitted from the submitted input. The server schema makes them optional and enforces the same rules.
- **One capability module** (`capabilities.ts`) feeds three consumers: the definition (option visibility), the server validation and the result. Validation therefore matches the UI exactly.
- **Only effort-type reasoning controls are exposed.** Budget and toggle types (Anthropic, Google) need coupled settings, such as thinking budget versus max tokens and temperature restrictions, and are not offered. The result lists them as "available but not exposed in this lab".
- **Server limits:**
  - `maxSteps` 1–6 (the lab budget);
  - `maxOutputTokens` 64–2000;
  - `stepMs` 1–60 s, and never more than the remaining run time;
  - `stepMs` and the run deadline both apply, and the stricter one wins.
- **The offline model honours `maxOutputTokens`.** It counts words as an approximation of tokens and truncates with `finishReason: length`, so token limits are visible offline too.

- **The example uses `maxOutputTokens: 1500`.** The first live check with 600 ended with `finishReason: length`: gpt-5-mini at effort `low` used 767 output tokens across two calls, reasoning included. The lab reported the limit correctly, but the example must succeed live. The instructions also ask for a plan under 150 words.

## Risks

- Registry data changes with Mastra upgrades. The capability module reads the registry at runtime, and tests assert the current values, so an upgrade that changes them fails loudly.
