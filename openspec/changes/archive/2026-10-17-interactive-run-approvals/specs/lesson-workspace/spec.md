## ADDED Requirements

### Requirement: Approval panel
The Run tab SHALL show an "Approval needed" panel for every pending approval with the tool name, arguments, message and expiry, and accessible Approve and Decline buttons; the status SHALL read "Waiting for your approval…" while any approval is pending.

#### Scenario: Approve from the browser
- **WHEN** a run requests approval and the learner presses Approve
- **THEN** the panel disappears, the timeline shows the resolution and the run continues to completion

#### Scenario: Decision fails
- **WHEN** posting the decision fails
- **THEN** the error is shown inside the panel, the buttons are re-enabled and the run is not marked finished
