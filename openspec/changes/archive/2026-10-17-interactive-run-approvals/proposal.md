# Proposal

## Why

In Lab 15 the learner picks Approve or Decline before the run starts, so the "human in the loop" is simulated. A real approval flow pauses the run, shows the pending tool call and waits for a person to decide. Later labs need the same capability: human-in-the-loop workflows, suspend/resume and guardrail reviews. So it belongs in the platform, not in one lab.

## What Changes

- **Contracts:**
  - New execution events: `approval-request` (`approvalId`, `toolName`, `args`, `message`, `expiresAt`) and `approval-resolved` (`approvalId`, `decision`, `reason`, `by: user | timeout`).
  - `ApprovalDecisionRequestSchema` for the decision body.
  - `RunSnapshot.pendingApprovals` (count).
- **Engine (`LabRunner`):**
  - `ctx.requestApproval({ toolName, args, message })` pauses the lab until `runner.resolveApproval(runId, approvalId, decision)`.
  - While a run waits, its deadline clock is paused.
  - Each wait is bounded by `approvalTimeoutMs` (default 5 min). On expiry it auto-declines with `by: 'timeout'`; the safe default is to not run the side effect.
  - Cancellation, disconnect and shutdown still abort a waiting run.
- **API:** `POST /api/runs/:runId/approvals/:approvalId` with `{ decision: 'approve' | 'decline', reason? }`, validated with Zod. Responses: 404 for an unknown run, 409 when the approval is not pending or the run has finished.
- **Web Run tab:**
  - An accessible "Approval needed" panel shows the tool, the arguments and the expiry time, with Approve and Decline buttons.
  - The status reads "Waiting for your approval…".
  - The timeline shows the request and the resolution.
- **Lab 15:**
  - The `userDecision` input gains `ask` ("Ask me during the run"), which uses `ctx.requestApproval`.
  - `approve` and `decline` remain as deterministic presets for the example, fixtures and CI.
  - The approval output records who decided (`by`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `lab-contracts`: event union gains the two approval events
- `lab-execution`: run pause/resume via approvals; deadline accounting
- `lesson-workspace`: Run tab approval panel
- `course-labs/lab-15-safe-tool-execution`: interactive decision

## Impact

- **Code:** `packages/contracts`, `packages/lab-engine`, `apps/api/src/routes/runs.ts`, `apps/web` (run state, client, Run tab, timeline), `packages/labs/src/lab-15`.
- **Compatibility:** backward compatible. Existing labs never call `requestApproval`, and new event types only add to the union.
- **Concurrency:** a waiting run keeps its concurrency slot, bounded by the approval timeout.
