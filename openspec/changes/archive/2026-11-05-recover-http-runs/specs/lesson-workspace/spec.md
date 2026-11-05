## ADDED Requirements

### Requirement: Standard execution reattachment
Standard Run tabs SHALL restore a remembered execution after reload and offer explicit recovery of the learner's latest retained run. Browser storage SHALL contain only an account-scoped run identifier, never mutation capabilities or input payloads. Reattachment SHALL replay events without duplication and preserve live cancel/approval controls. Failed restoration and interrupted executions SHALL be surfaced accessibly without automatically starting a new execution.

#### Scenario: Reload while waiting for approval
- **WHEN** the learner reloads a standard Run tab during a live pending approval within the reconnect grace period
- **THEN** the same run and approval are restored and its decision uses a recovered capability

#### Scenario: Account changes
- **WHEN** learner A signs out and learner B signs in on the same browser
- **THEN** A's remembered run and late recovery responses do not appear in B's workspace

#### Scenario: Reset the local execution view
- **WHEN** the learner resets the execution view
- **THEN** its remembered run identifier is removed without deleting server history or starting another run
