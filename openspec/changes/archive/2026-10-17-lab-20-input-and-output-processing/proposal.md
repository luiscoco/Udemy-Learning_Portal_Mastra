# Proposal

## Why

Agents must not spend tokens on requests that should never reach a model, such as prompt injection, leaked secrets or disallowed topics. Their raw output (free-form labels, stray whitespace, personal data) also must be normalized into a typed shape that the rest of an application can trust. Mastra provides processors for both sides. Learners need to see:

- which processors exist,
- what an `abort()` looks like to the caller (a tripwire, not an exception),
- where an explicit normalization wrapper is still needed.

## What Changes

- **New lab `lab-20`** (Module 04, the last lab of the module).
- **Input processors** (preflight, in order):
  - Mastra's built-in `UnicodeNormalizer`: strips control characters, collapses whitespace, trims.
  - A custom `support-policy` processor: input length limit, blocked topics, prompt-injection heuristics. It calls `abort(reason, { metadata: { category } })`.
  - Mastra's `RegexFilterProcessor` with the `secrets` preset plus custom rules for raw provider keys (`block`).
  - A pass-through audit processor that records the text actually sent to the model.
- **Output processor:** Mastra's `RegexFilterProcessor` with the `pii` preset (`redact`), toggleable.
- **Typed result:**
  - `structuredOutput` with a lenient schema, followed by an explicit `normalizeTriage()` wrapper;
  - the wrapper maps synonyms, coerces values, trims and bounds text, and dedupes tags;
  - each normalization applied is reported;
  - the result is validated against a strict `TriageSchema`.
- **The learner's task:** a batch of 1–6 requests, each with an expected outcome (`accept` or `reject`). For each request the run shows the rejecting processor, the category and the reason, or the normalized result.

## Capabilities

### New Capabilities

- `course-labs/lab-20-input-and-output-processing`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-20/`. Offline is free. Live mode makes one model call per *accepted* request; rejected requests never reach the model.
