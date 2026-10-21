# Proposal

## Why

L15 introduced a role allowlist and one approval step, and L63 a gateway against injected calls. Real deployments need policies that operators can read and change: which role may call which write tool, under which conditions, and who must confirm it. The DoD for L64: denied actions are never invoked, and the audit log captures every decision.

## What Changes

- **New lab `lab-64` (Module 13): an account-operations desk.**
  - Tools: `lookupAccount` (read), `issueRefund`, `changeEmail`, `closeAccount` (write). Every side effect goes to in-memory sandbox sinks.
  - The operator's role (`viewer`, `support-agent`, `supervisor`) comes from the run input, standing in for the verified session role. The human confirmer's identity (`self`, `team-lead`, `manager`) is chosen separately.
- **Policy as data.** The learner edits a JSON policy (`json` input). It is validated with Zod:
  - unique rule ids;
  - only known tools and roles;
  - `confirm` rules name approver roles;
  - the default must be `deny`, so a policy that fails open is rejected.

  Evaluation is first match wins, with conditions such as `maxAmountCents`. Every decision records its rule id, or `default` when no rule matched.
- **Native Mastra approval hooks (verified by a spike with @mastra/core 1.78.0):**
  - `requireApproval: (input) => effect !== 'allow'` sends deny and confirm calls to the approval gate;
  - `beforeApproval` rejects denied calls with `{ proceed: false, output }`, so they never execute and are never shown to a human;
  - confirm calls suspend the run until `agent.approveToolCall` or `agent.declineToolCall`;
  - `execute` re-evaluates the policy and checks the approval bound to the same tool call and argument hash, because `beforeApproval` does not run on resume.
- **Explicit human confirmation with separation of duties.** The approver must hold one of the rule's approver roles and must not be the requester (`self`). An ineligible approver is declined automatically and audited, without prompting. The decision is a preset (approve or decline), or asked during the run via `ctx.requestApproval`.
- **Audit log.** It is append-only and hash-chained: each entry stores `prevHash` and `hash = sha256(prevHash + entry)`. Entries record the policy decision, the approval decision and the execution outcome, with personal data masked (email local parts). The log persists per learner under `ctx.services.files('lab-64-audit')`, serialized per file. Each run verifies the whole chain and reports where it breaks, if it does.
- **Offline:** a scripted operator model that turns the request into tool calls. **Live:** a real model with the same tools and policy.
- **Tests:**
  - policy validation and evaluation;
  - audit chain and tamper detection;
  - denied-never-invoked counters;
  - self-approval and wrong-role approvers;
  - argument binding;
  - ask mode;
  - e2e and live.

## Out of scope

Persisting policies server-side or editing them per organization. A production policy engine (OPA/Cedar) adapter is discussed in the lesson as the next step.
