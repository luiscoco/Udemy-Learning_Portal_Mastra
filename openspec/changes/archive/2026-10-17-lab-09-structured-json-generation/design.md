# Design

## Context

Spiked with the installed version: with `structuredOutput` the model call receives `responseFormat: { type: 'json', schema }`; valid replies (including ```json fences) populate `result.object`; `strict` throws a MastraError with id `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` and a message listing `- path: message` issues; `warn` returns `object === undefined`; `fallback` returns `fallbackValue` with `usedFallbackValue: true`.

## Decisions

- Catch strict errors inside the lab and return them as data (code + parsed issues) so the run completes — the learning goal is graceful handling.
- Re-validate `result.object` with `TicketSchema.safeParse` (defence in depth).
- Offline extractor is deterministic and always schema-valid (unit-tested on edge inputs).
