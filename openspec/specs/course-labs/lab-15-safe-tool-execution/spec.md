# course-labs/lab-15-safe-tool-execution Specification

## Purpose
Lab 15 teaches safe execution of side-effect tools: role-based tool allowlists, native Mastra human approval and policy enforcement inside execute(), with an append-only audit trail.

## Requirements

### Requirement: Role-based tool allowlist
Lab 15 SHALL give the agent only the tools allowed for the selected role; calls to any other tool SHALL be blocked without executing and recorded in the audit trail.

#### Scenario: Viewer requests a refund
- **WHEN** the role is `viewer` and the request asks for a refund
- **THEN** `issueRefund` fails as an unknown tool, the ledger is unchanged and the audit contains a `blocked` entry

#### Scenario: Unregistered destructive tool
- **WHEN** the request asks to delete the customer
- **THEN** the `deleteCustomer` call is blocked and nothing is executed

### Requirement: Native human approval for side effects
The refund tool SHALL use Mastra `requireApproval`; the run SHALL suspend and resume via `approveToolCall` or `declineToolCall` with the pending `runId` and `toolCallId`.

#### Scenario: Approved refund runs once
- **WHEN** the example runs with decision `approve`
- **THEN** a suspended approval step precedes the tool finish, `execute()` runs once and the ledger holds exactly one refund `RF-0001` of 4500 cents for ORD-1001

#### Scenario: Declined refund never runs
- **WHEN** the decision is `decline`
- **THEN** the tool finishes with status `denied`, `execute()` is never invoked and the ledger is empty

### Requirement: Policy enforced after approval
`execute()` SHALL re-check policy (role, €200.00 limit, amount paid, one refund per order) and deny violating calls even when approved.

#### Scenario: Approved refund above the limit
- **WHEN** a 450.00 refund on ORD-1002 is approved
- **THEN** the audit shows `approved` then `denied-by-policy` and the ledger is unchanged

### Requirement: Append-only audit trail
Every read, blocked, approval-requested, approved, declined, executed and denied-by-policy decision SHALL be appended with a sequence number, tool, arguments, reason and actor; entries SHALL NOT be modifiable.

#### Scenario: Audit sequence for the example
- **WHEN** the example runs
- **THEN** the audit decisions are `read`, `approval-requested`, `approved`, `executed` in order

### Requirement: Interactive approval decision
With `userDecision: "ask"`, Lab 15 SHALL pause on the refund approval via the platform approval primitive and apply the learner's live decision; `approve` and `decline` SHALL remain deterministic presets.

#### Scenario: Learner approves during the run
- **WHEN** the run asks for approval and the learner approves
- **THEN** the ledger holds one refund and the approval is recorded with `by: "user"`

#### Scenario: Nobody answers
- **WHEN** the approval times out
- **THEN** the refund is declined, the ledger is empty and the approval is recorded with `by: "timeout"`
