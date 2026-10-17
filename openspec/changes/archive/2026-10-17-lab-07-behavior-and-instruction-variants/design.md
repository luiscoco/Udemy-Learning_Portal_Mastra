# Design

## Decisions

- **configHash** = first 12 hex of SHA-256 over a canonical JSON of `{ label, modelId, instructions, settings }`. Same config → same hash across runs, so learners can recognise repeated configurations.
- **Identical settings** are enforced by construction (one shared `settings` object passed to both `generate` calls) and verified offline from the scripted model's recorded calls.
- **Storage**: `dataDir()/comparisons/<runId>.json` with prune-to-20 after each write; records contain no secrets (ids, hashes, text). Writes are server-side only; learners never choose paths.
- **Sequential** generation for predictable cost and rate limits.
