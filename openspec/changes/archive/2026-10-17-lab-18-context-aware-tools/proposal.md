# Proposal

## Why

Tools often return data that must look different per caller:

- **Role:** what a customer, a support agent or an admin may see.
- **Locale:** dates, money, units and labels.

The safe place for that decision is the tool itself, using the request-scoped context, because the model must never receive fields it should not show. A common real-world bug is caching the formatted tool output. One session's role and locale view is then served to the next session.

## What Changes

- **New lab `lab-18`** (Module 04).
- **The tool.** `getOrderSummary({ orderId })` reads `role` and `locale` from `context.requestContext`, validated by the tool's `requestContextSchema`. It loads the raw order and returns a role- and locale-specific view:
  - **Redaction by role:** customer, support or admin.
  - **Intl formatting:** date, EUR total, weight in kg, plus localized status labels.
  - **Escaped untrusted text:** the stored customer delivery note is HTML-escaped, stripped of control characters, length-bounded and marked `untrusted: true`.
- **Inputs.** The learner runs 1–4 sessions, each with its own role and locale, one after another, against one agent and one tool instance.
- **Cache strategy toggle:**
  - `cache-raw-data` (correct): caches only the raw record and formats per call.
  - `cache-formatted-output` (anti-pattern): caches the formatted view keyed by order id only. A later session receives an earlier session's role and locale view, and the checks fail.
  - The cache is scoped to the run, so learners never affect each other.

## Capabilities

### New Capabilities

- `course-labs/lab-18-context-aware-tools`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-18/`. Offline is free. Live mode makes about two model calls per session, up to 8.
