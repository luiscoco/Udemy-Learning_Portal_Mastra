# Proposal

## Why

Agents become powerful when they combine tools. Learners must see how an agent chooses tools, issues independent calls in parallel, chains dependent calls, and stays grounded — with every call traced separately.

## What Changes

- New lab `lab-13` (Module 03) with two mock tools: `inventory-lookup` (fixed catalog) and `format-currency` (fixed USD→EUR/GBP/JPY rates, `Intl.NumberFormat` en-US).
- A real Mastra `Agent` with both tools and `maxSteps: 5`; offline script: parallel lookups → formats for found items → grounded answer; live: the model decides.
- Checks: every SKU looked up, formatting chained from lookup prices, each call has its own id and is logged separately, answer grounded in tool output. Stable, ordered assertions on the event timeline in unit tests.

## Capabilities

### New Capabilities

- `course-labs/lab-13-multiple-tools`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-13/`. Live ≈ three model calls.
