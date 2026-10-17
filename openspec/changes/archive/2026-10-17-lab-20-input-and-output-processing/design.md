# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike):

- **Processor hooks.** `new Agent({ inputProcessors, outputProcessors })` accepts processor objects with `processInput({ messages, abort })` and `processOutputResult(...)`.
- **An abort is a tripwire, not an exception.** A custom processor calling `abort(reason, { metadata })` makes `generate()` resolve with:
  - `text: ""` and `finishReason: "other"`;
  - `tripwire: { reason, metadata, processorId }`.

  It does not throw, and the model is not called.
- **`UnicodeNormalizer`.** With `{ stripControlChars, collapseWhitespace, trim }`, the model received `"hello world"` for `"  hello\u0007   world  "`.
- **`RegexFilterProcessor` with a custom rule and `block`.** It returns a tripwire whose `metadata` is `{ processorId: 'regex-filter', matches: [{ rule, match: '[REDACTED_MATCH]' }], strategy: 'block' }`. The match text is masked, and the top-level `processorId` is the agent-scoped `"<agentId>-input-processor"`.
- **The `secrets` preset** contains only `api-key: …` assignments, `Bearer …` tokens and AWS keys (`AKIA…`). It did **not** catch a raw `sk-proj-…` key, so custom rules are required.
- **`RegexFilterProcessor({ presets: ['pii'], strategy: 'redact' })` on output** redacts `text` and `structuredOutput` objects (`[EMAIL]`, `[PHONE]`).
- **Structured output is not normalized.** `"Billing"`, `"HIGH"` and padded strings come back as the model produced them.

## Decisions

- **Order matters.**
  1. Normalize first, so the later checks see canonical text.
  2. Run cheap deterministic policy and secret checks.
  3. Run the audit processor last, so it records exactly what the model receives.

  LLM-based built-ins (`ModerationProcessor`, `PromptInjectionDetector`, `PIIDetector`) are named in the lesson but not used. They need a second model call per request, and offline determinism would depend on their internal prompts.
- **Rejection identity.** The rejecting processor is reported as `metadata.processorId ?? tripwire.processorId`, because built-ins put their own id in the metadata.
- **No secret echo.** Request text is never echoed raw. The output keeps a preview masked with the same secret rules, so a rejected secret never appears in events or results.
- **Normalization is an explicit, pure function.** `normalizeTriage(raw) → { value, applied[] }`:
  - unknown categories map to `other`;
  - strings are NFKC-normalized and whitespace is collapsed;
  - the summary is cut to 200 characters;
  - tags are lowercased, deduplicated and limited to 5;
  - `needsHuman` is parsed from `yes`, `true`, `no` and `false`.

  The strict `TriageSchema.safeParse` is the check.
- **Learner expectations make the checks meaningful.** Each request states `accept` or `reject`, and the `expectations-met` check compares the pipeline's decision with the learner's prediction.

## Risks

- **Heuristic injection detection** misses paraphrases. The lesson says so, and names the LLM-based detectors as the next step.
