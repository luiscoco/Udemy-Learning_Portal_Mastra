# Design

## Files (`packages/labs/src/lab-64/`)

- **`policy.ts`:**
  - `PolicySchema` (Zod): `default: 'deny'` (a literal) and `rules[]` with `{ id, tools[], roles[], when?: { maxAmountCents? }, effect: allow | confirm | deny, approverRoles? }`. Refinements: unique ids; `confirm` requires `approverRoles`.
  - `DEFAULT_POLICY`.
  - `evaluate(policy, { role, toolName, args })` returns `{ effect, ruleId, reason, approverRoles }`; first match wins, otherwise the default.
  - `eligibleApprover(decision, approver)` returns `{ ok, reason }`; `self` is never eligible.
- **`audit.ts`:**
  - `AuditLog`: `append(entry)` computes `prevHash`/`hash` and appends a JSONL line under a `KeyedLock` keyed by file path.
  - `verify()` returns `{ valid, entries, brokenAt? }`; `mask(args)` hides email local parts.
  - Each entry: `{ seq, at, runId, actor, role, toolName, toolCallId, argsHash, args (masked), stage: policy | approval | execution, decision, ruleId?, reason }`.
- **`tools.ts`:** `createOpsTools({ role, policy, audit, approvals, sinks, counters })` builds Mastra tools with `requireApproval`, `beforeApproval` and `execute` as in the proposal. `counters[tool]` counts real executions. `approvals` maps `toolCallId` to `{ argsHash, approver }`, written by `run.ts` before it approves.
- **`run.ts`:**
  - Validates the policy, opens the per-tenant audit (with optional reset) and runs the agent with `streamAgent`.
  - Loops over pending approvals (bounded rounds):
    - **ineligible approver:** decline the call;
    - **ask:** `ctx.requestApproval`;
    - **preset:** use it.
  - Records the decision in `approvals` and the audit, then resumes with `approveToolCall` or `declineToolCall`.
  - Builds a per-call decision table and verifies the audit chain.

## Offline script

The scripted model parses the request:

- `refund ORD-dddd €N` becomes `issueRefund`;
- `email of CUS-dddd to x@y` becomes `changeEmail`;
- `close account CUS-dddd` becomes `closeAccount`;
- `look up CUS-dddd` becomes `lookupAccount`.

It issues all calls in one turn, then summarizes the results.

## Checks

- `denied-never-invoked`
- `confirmed-before-execute`
- `separation-of-duties`
- `policy-fail-closed`
- `audit-complete`
- `audit-chain-intact`
