# course-labs/lab-64-tool-approval-policies Specification

## Purpose
Define the Tool approval policies lab (L64): write a role-based policy for write-capable tools, enforce it with Mastra’s approval hooks, require separated human confirmation, and keep a tamper-evident audit of every decision.

## Requirements

### Requirement: Role-based tool policy that fails closed
The lab SHALL evaluate every tool call against a validated, learner-editable policy where the first matching rule decides allow, confirm or deny, and calls matching no rule are denied.

#### Scenario: Unmatched destructive call
- **WHEN** a support agent asks to close an account and no rule allows that role
- **THEN** the call is denied by the default rule and its execute function is never invoked

#### Scenario: Fail-open policy rejected
- **WHEN** the learner submits a policy whose default is allow
- **THEN** the run is refused with a validation error

### Requirement: Explicit, separated human confirmation
A call with a confirm decision SHALL execute only after an eligible human approver confirmed that exact call; the requester can never approve their own action.

#### Scenario: Self-approval
- **WHEN** the chosen approver is the requester
- **THEN** the call is declined without prompting and is never invoked

#### Scenario: Approved large refund
- **WHEN** a team lead approves a refund that requires confirmation
- **THEN** the refund executes once with the approved arguments

### Requirement: Tamper-evident audit of every decision
Every policy decision, approval decision and execution outcome, including calls rejected for invalid input and calls declined at the approval round limit, SHALL be appended to an audit log persisted per learner whose entries are chained with a server-held HMAC key and whose head is anchored, and each run SHALL verify the chain and the anchor.

#### Scenario: Edited audit entry
- **WHEN** an earlier audit line is modified
- **THEN** verification reports the chain as broken at that entry

#### Scenario: Rebuilt chain without the key
- **WHEN** someone edits an entry and recomputes every hash with plain SHA-256
- **THEN** verification still reports the chain as broken

#### Scenario: Truncated log
- **WHEN** the last entries of the log are removed
- **THEN** verification reports the log as truncated against its anchor

#### Scenario: Invalid tool input
- **WHEN** the model calls a tool with arguments that fail its schema
- **THEN** the call is audited as denied by input validation and not invoked, and the run's checks pass
