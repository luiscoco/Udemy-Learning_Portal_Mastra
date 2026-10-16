# Design

## Decisions

- **Validation in the Zod input schema** (`superRefine` with `checkModelId`) so errors are field-level 422s shown next to the input before any work starts.
- **Simulated styles** per provider in offline mode (concise sentence / bullet list / numbered steps) labelled "[simulated <id>]" so learners see that model choice changes output without pretending to be the real model.
- **Instructions hash** (SHA-256, first 12 hex) lets learners compare runs without storing full prompts in logs.
- **Preflight** reads `liveModelCatalog(process.env)` and reports ids with configured yes/no; values are never read into output.
- Sequential generation (not parallel) keeps live cost and rate limits predictable; budget = 2 model calls.

## Risks / Trade-offs

- [Simulated styles could be mistaken for real behaviour] → explicit label in text and `simulated: true` in the record.
