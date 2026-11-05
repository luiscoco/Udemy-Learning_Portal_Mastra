## MODIFIED Requirements

### Requirement: Persistent progress
Progress SHALL be saved through the storage adapter and survive reloads; a lab becomes completed only when the lesson is marked read, a run succeeded with all checks passing and the quiz is passed. Authenticated progress SHALL also survive changing browsers through account synchronization, with offline drafts and conflicts surfaced accessibly. Guest progress SHALL remain local and eligible for migration on sign-in.

#### Scenario: Reload keeps progress
- **WHEN** a learner completes Dummy Lab 00 and reloads the page
- **THEN** the lab and course progress still show it completed

#### Scenario: Progress from another browser
- **WHEN** the learner signs in from a second browser after a successful save
- **THEN** their completion, quiz, notes and self-check records are restored
