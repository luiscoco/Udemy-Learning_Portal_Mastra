# Proposal

## Why

Tools are how agents act and compute exactly. Learners need a first, safe, deterministic tool, registered properly, with its call visible end to end.

## What Changes

- New lab `lab-11` (Module 03): `calculate-order-total` built with `createTool` (Zod input/output schemas, pure `execute`, integer cents, half-up rounding: discount on subtotal, tax on discounted amount).
- The tool is given to a real Mastra `Agent` (`tools`) and registered on a `Mastra` instance (`tools`, `getToolById`, `listTools`).
- Shared `streamAgent` helper maps Mastra stream chunks to lab events: `text-delta` → `token`, `tool-call` → `tool-start`, `tool-result` → `tool-finish` (input-validation failures reported as errors), `tool-error` → `tool-finish` error; durations measured.
- Checks: registration, tool called, totals correct (independent recomputation), answer quotes the tool total.

## Capabilities

### New Capabilities

- `course-labs/lab-11-first-custom-tool`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-11/`, `packages/labs/src/shared/tool-stream.ts`. Live = two model calls.
