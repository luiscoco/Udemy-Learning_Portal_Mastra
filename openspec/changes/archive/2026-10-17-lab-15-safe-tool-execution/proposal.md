# Proposal

## Why

Tools with side effects (refunds, deletions) are the riskiest part of an agent: the model decides when to call them. Learners must see least-privilege tool sets, human approval and policy enforcement working together, and prove that a side effect runs exactly once.

## What Changes

- New lab `lab-15` (Module 03): support agent with a read-only `lookupOrder` and a side-effect `issueRefund` over a mock payments ledger.
- Layer 1, role allowlist: `support-agent` gets both tools and `viewer` gets only `lookupOrder`. Tools outside the allowlist are never given to the agent, so an attempt fails as an unknown tool (blocked). `deleteCustomer` is never registered.
- Layer 2, native Mastra approval: `issueRefund` uses `requireApproval: true`. The run suspends on `tool-call-approval` and resumes with `agent.approveToolCall` or `agent.declineToolCall` (`{ runId, toolCallId }`). The learner's decision is a lab input, so runs are repeatable.
- Layer 3, policy inside `execute()`: role re-check, a €200.00 limit, amount ≤ amount paid, one refund per order (idempotent). The policy denies even approved calls.
- An append-only audit trail (`read`, `blocked`, `approval-requested`, `approved`, `declined`, `executed`, `denied-by-policy`).
- The shared stream bridge (`shared/tool-stream.ts`) gains `consumeStream` for resumed streams, plus `tool-call-approval` handling (suspended step, `pendingApprovals`) and `tool-output-denied` handling (`tool-finish` status `denied`).

## Capabilities

### New Capabilities

- `course-labs/lab-15-safe-tool-execution`

### Modified Capabilities

(none; the bridge change is backward compatible)

## Impact

`packages/labs/src/lab-15/` and `packages/labs/src/shared/tool-stream.ts`. Offline is free. Live mode makes about 3–4 model calls. No real money moves: the ledger is a mock.
