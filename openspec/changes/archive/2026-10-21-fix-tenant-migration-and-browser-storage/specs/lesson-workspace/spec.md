## ADDED Requirements

### Requirement: Browser storage scoped per learner
Progress and scratch notes saved in the browser SHALL be stored under a scope derived from the signed-in learner, so another learner on the same browser never sees them.

#### Scenario: Second learner on a shared browser
- **WHEN** learner A saves progress and a scratch note, signs out, and learner B signs in on the same browser
- **THEN** B sees none of A's progress or notes, and A sees them again after signing back in

#### Scenario: Data saved before scoping
- **WHEN** a learner with no scoped data signs in and the browser holds unscoped progress or notes
- **THEN** that data moves to the learner once and is no longer shown when signed out
