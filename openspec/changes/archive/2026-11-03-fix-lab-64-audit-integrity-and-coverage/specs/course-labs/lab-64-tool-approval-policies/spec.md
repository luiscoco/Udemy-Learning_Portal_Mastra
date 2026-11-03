## MODIFIED Requirements

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
