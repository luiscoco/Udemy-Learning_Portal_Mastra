## Purpose

Preserve the learner's complete course progress across API restarts and browsers while keeping offline edits recoverable and account data isolated.

## ADDED Requirements

### Requirement: Durable authenticated progress
Authenticated learners SHALL read, save and reset complete progress records through validated, typed APIs. The server MUST derive the storage owner from the session, enforce bounded inputs and known lab ids, and derive completion status from the existing lesson, run and quiz rules. Progress SHALL survive a process restart independently of browser storage.

#### Scenario: A new device
- **WHEN** a learner saves notes, quiz results and completion flags, then signs in from a fresh browser
- **THEN** the saved records are restored without copying browser storage

#### Scenario: API restart
- **WHEN** the API process exits after a successful save and a new process opens the same data directory
- **THEN** the learner can sign in again and recover the saved progress

### Requirement: Account-bound synchronization
Every progress request SHALL bind its expected account to the verified session and SHALL access only that session's records. A late response or queued edit from a previous account MUST NOT appear in or be saved to a different account. Anonymous access SHALL return 401; an account mismatch SHALL return 404 without disclosing data.

#### Scenario: Account changes during a request
- **WHEN** learner A's request is delayed until after sign-out and learner B signs in
- **THEN** A's pending edit remains scoped to A and cannot modify or display B's progress

### Requirement: Revision checks and durable reset
Saves and resets SHALL require the last observed server revision. A stale revision MUST produce a conflict without overwriting stored data. The learner SHALL choose whether to keep their device edit or use the saved version. Reset records SHALL retain revision markers so stale browser data cannot recreate deleted progress.

#### Scenario: Concurrent notes
- **WHEN** two devices edit the same revision and one saves first
- **THEN** the other device keeps its draft and shows conflict resolution controls

#### Scenario: Reset followed by an old import
- **WHEN** progress is reset and an older browser later imports that lab
- **THEN** the reset remains effective and old progress is not restored

### Requirement: Recoverable offline editing and legacy import
Edits SHALL remain locally queued while offline and retry when connectivity returns. Save status and failures MUST be accessible and truthful. Existing browser records SHALL be imported only where no account record or reset marker exists, in bounded idempotent batches. Original browser data SHALL remain available as an exportable backup.

#### Scenario: Offline reload
- **WHEN** a learner edits notes offline, reloads and reconnects
- **THEN** the draft remains visible and is saved or presented as a conflict, never silently discarded

#### Scenario: Existing account progress
- **WHEN** a browser imports older records for labs already stored on the account
- **THEN** account records are not overwritten and the device backup remains available
