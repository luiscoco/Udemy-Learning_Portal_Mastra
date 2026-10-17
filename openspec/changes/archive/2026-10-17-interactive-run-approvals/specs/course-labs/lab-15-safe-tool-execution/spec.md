## ADDED Requirements

### Requirement: Interactive approval decision
With `userDecision: "ask"`, Lab 15 SHALL pause on the refund approval via the platform approval primitive and apply the learner's live decision; `approve` and `decline` SHALL remain deterministic presets.

#### Scenario: Learner approves during the run
- **WHEN** the run asks for approval and the learner approves
- **THEN** the ledger holds one refund and the approval is recorded with `by: "user"`

#### Scenario: Nobody answers
- **WHEN** the approval times out
- **THEN** the refund is declined, the ledger is empty and the approval is recorded with `by: "timeout"`
