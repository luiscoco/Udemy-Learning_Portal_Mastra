# Proposal

## Why

Agents become useful to code only when their output is typed and trustworthy. Learners must request structured output with a Zod schema and handle the inevitable malformed replies without crashing or passing bad data on.

## What Changes

- New lab `lab-09` (Module 02): extract a support ticket (`TicketSchema`: title, priority enum, category enum, tags, nullable email) from a message.
- Run: `agent.generate(message, { structuredOutput: { schema, errorStrategy, fallbackValue? } })` on a real Mastra `Agent`; the typed value is read from `result.object` and validated again with the same Zod schema.
- Error strategies `strict` (Mastra throws `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`; the lab reports the field issues), `warn` (no object), `fallback` (configured fallback ticket) — all complete the run.
- Offline fault injection: valid, fenced (```json), wrong-shape and broken JSON replies. The JSON Schema sent to the model (`z.toJSONSchema`) is shown.

## Capabilities

### New Capabilities

- `course-labs/lab-09-structured-json-generation`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-09/`. Live = one structured-output model call.
