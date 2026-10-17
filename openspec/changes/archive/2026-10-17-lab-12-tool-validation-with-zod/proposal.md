# Proposal

## Why

Tool inputs come from a model and cannot be trusted. Learners must design schemas that reject bad arguments before any business logic runs, and surface precise field errors.

## What Changes

- New lab `lab-12` (Module 03): `support-action` tool with a `z.discriminatedUnion('action', [refund, exchange])` input (custom messages, business limit "refunds above $500 need a human") and a discriminated output union (`accepted` | `rejected`).
- The learner supplies the exact arguments the model sends (offline); a per-run `execute` counter proves invalid input never reaches business logic; field errors come from the same schema and Mastra's own tool validation message.
- Unit tests for every schema branch; checks for non-execution, field errors, agreement with Mastra validation, and typed output.

## Capabilities

### New Capabilities

- `course-labs/lab-12-tool-validation-with-zod`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-12/`. Live = up to two model calls.
