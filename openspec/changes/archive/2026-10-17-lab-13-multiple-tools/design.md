# Design

## Decisions

- Mock tools with fixed data and fixed exchange rates (documented as mocks, not market data) keep results identical across runs.
- The scripted model issues multiple tool calls in one turn (Mastra executes them in the same step), demonstrating parallel calls; dependent formatting happens in the next step.
- Expected values are recomputed independently (`lookupSku`, `convertAndFormat`) for grounding checks.
- `Intl.NumberFormat('en-US', …)` output verified on Node 24 (e.g. `€18.39`, `¥2,268`).
