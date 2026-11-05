## ADDED Requirements

### Requirement: Durable recorded executions
Configured persistent execution storage SHALL retain owner-bound snapshots and ordered redacted events across API restarts, within documented retention limits. A run's initial record MUST commit before lab execution starts; normal events MUST commit before being streamed. Storage or integrity failures SHALL fail closed. Persistent mode SHALL refuse concurrent active runners on the same journal.

#### Scenario: Completed execution after restart
- **WHEN** the owning learner fetches a retained completed run after an API restart
- **THEN** its snapshot and ordered SSE events, ending in complete, are available without executing the lab again

#### Scenario: Initial journal write fails
- **WHEN** persistent storage cannot record a new run
- **THEN** the request fails and the lab's code is not started

#### Scenario: Another runner owns the journal
- **WHEN** another API process attempts to use a journal that already has an active runner
- **THEN** startup is refused without changing live run records

### Requirement: Safe interruption recovery
After a persistent runner restarts, executions recorded as running SHALL become failed with an explicit interruption error and zero actionable approvals. Their code MUST NOT resume or rerun automatically, and no human decision SHALL be fabricated. A stale approval decision SHALL return conflict. Existing explicitly persisted workflow snapshots remain independent of HTTP execution recovery.

#### Scenario: Process exits during approval
- **WHEN** the API exits while a run waits for approval and then restarts
- **THEN** the recorded run is failed, the interruption is replayed, and a late approval cannot trigger its former continuation

### Requirement: Owner execution and capability recovery
Authenticated owners SHALL list a bounded set of their recent runs and obtain a new bounded mutation capability for a known run. Other learners SHALL receive 404 for that run and anonymous callers 401. Recovery capabilities MUST NOT appear in snapshots, events or logs, and persistent storage SHALL retain only their hashes. The original start capability SHALL remain valid while retained.

#### Scenario: Recover after losing the tab capability
- **WHEN** the owner recovers a live run using their verified session
- **THEN** the response provides its snapshot and a new capability usable for cancellation and pending approvals

#### Scenario: Another learner requests recovery
- **WHEN** learner B requests learner A's run recovery
- **THEN** the response is 404 and no capability is issued

#### Scenario: Recent run discovery
- **WHEN** a learner requests recent runs for a lab
- **THEN** the response contains only their bounded retained snapshots and no capability values
