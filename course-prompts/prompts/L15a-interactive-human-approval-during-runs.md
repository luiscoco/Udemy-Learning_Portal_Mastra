# L15a — Interactive human approval during runs

**Module:** 03 Tools and Function Calling · **Step 24 of 91** · **OpenSpec change:** `interactive-run-approvals`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L15](L15-safe-tool-execution.md) · Next: [L15b](L15b-run-tokens-and-approval-capacity.md)

## Copy-ready prompt

Implement platform follow-up L15a — "Interactive human approval during runs".

Why: in L15 the learner chooses Approve or Decline before the run starts, so the human in the loop is simulated. Later labs (suspend/resume, human approval, guardrails, tool policies) need a run to pause, show the pending tool call and wait for a person. This belongs in the platform, not in one lab.

Requirements:
- Contracts: execution events approval-request (approvalId, toolName, args, message, expiresAt) and approval-resolved (approvalId, decision, reason, by: user | timeout); an ApprovalDecisionRequest schema; RunSnapshot.pendingApprovals.
- Engine: ctx.requestApproval({ toolName, args, message }) pauses the lab until runner.resolveApproval(runId, approvalId, decision). The run deadline is paused while waiting. Each wait is bounded (default 5 min) and auto-declines on expiry, so the side effect does not run. Cancellation, disconnect and shutdown still abort a waiting run.
- API: POST /api/runs/:runId/approvals/:approvalId with { decision: 'approve' | 'decline', reason? }, validated with Zod; 404 unknown run, 409 not pending or finished.
- Web Run tab: an accessible "Approval needed" panel with tool, arguments, expiry and Approve/Decline; status "Waiting for your approval…"; the timeline shows request and resolution.
- L15: the userDecision input gains "ask" (decide during the run); approve and decline stay as deterministic presets for fixtures and CI; the output records who decided.

Definition of done: engine, API and web tests cover approve, decline, timeout and cancel while waiting; an e2e test approves a pending tool call in the Run tab.

First create an OpenSpec change named interactive-run-approvals with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
