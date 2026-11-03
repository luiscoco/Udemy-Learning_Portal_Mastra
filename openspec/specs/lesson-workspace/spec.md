# lesson-workspace Specification

## Purpose
Learner and instructor experience for an individual lab: Learn, Run and Source tabs, quiz, notes, instructor assets and persisted progress.

## Requirements

### Requirement: Three-tab workspace
Every available lab SHALL render Learn, Run and Source tabs following the WAI-ARIA tabs pattern (arrow-key navigation), with the selected tab reflected in the `?tab=` query so it can be deep-linked.

#### Scenario: Deep-linked tab
- **WHEN** a learner opens `/labs/lab-00?tab=source`
- **THEN** the Source tab is selected

### Requirement: Learn tab content
The Learn tab SHALL show objectives, prerequisites, the concept, an optional diagram, the procedure, a prediction prompt whose answer is saved, hints revealed one level at a time, common mistakes and the challenge, and a control to mark the lesson read.

#### Scenario: Progressive hints
- **WHEN** a learner reveals hints
- **THEN** hint 2 is only available after hint 1, and hint 3 after hint 2

### Requirement: Run tab execution
The Run tab SHALL render a validated form from the lab's input fields, reject invalid values client-side, start a run in the selected mode, stream events into a timeline, show streamed tokens incrementally, show tool and workflow-step traces, allow cancellation, and display the result with each automated check.

#### Scenario: Successful run
- **WHEN** a learner runs Dummy Lab 00 with the example input
- **THEN** tokens appear before completion, the timeline ends with `complete` `succeeded`, all checks show passed and progress records a successful run

#### Scenario: Cancel
- **WHEN** a learner presses Cancel during a run
- **THEN** the run ends with status cancelled and the form is usable again

#### Scenario: Server validation errors
- **WHEN** the API rejects the input with `VALIDATION_FAILED`
- **THEN** each field-level message is shown next to its field

#### Scenario: Live mode notice
- **WHEN** a lab supports live mode and the learner selects it
- **THEN** the cost notice is shown before running

### Requirement: Source tab
The Source tab SHALL display the lab's readonly reference files with syntax highlighting and pinned dependency versions, offer copy and download per file, show exercise instructions with a local scratchpad that is never executed, and hide the solution until the learner explicitly reveals it.

#### Scenario: Solution hidden by default
- **WHEN** the Source tab opens
- **THEN** the solution file content is not displayed until "Reveal solution" is confirmed

### Requirement: Quiz, self-check and notes
The workspace SHALL provide a scored quiz with explanations after submission and a retake option (pass ≥ 70%), a self-check list of the objectives, and autosaved notes limited to 10,000 characters.

#### Scenario: Quiz scoring
- **WHEN** a learner answers 3 of 4 questions correctly and submits
- **THEN** the score 3/4 is shown, the quiz counts as passed and explanations are visible

### Requirement: Persistent progress
Progress SHALL be saved through the storage adapter and survive reloads; a lab becomes completed only when the lesson is marked read, a run succeeded with all checks passing and the quiz is passed.

#### Scenario: Reload keeps progress
- **WHEN** a learner completes Dummy Lab 00 and reloads the page
- **THEN** the lab and course progress still show it completed

### Requirement: Instructor assets
The workspace SHALL show the instructor demonstration outline (segments, minutes, talking points) and export it with the lab's objectives, checks and quiz as a JSON file.

#### Scenario: Export
- **WHEN** an instructor presses "Export JSON"
- **THEN** a file named `lab-00-instructor.json` is downloaded containing the outline

### Requirement: Error and empty states
Every API failure in the workspace (definition, source, preflight, run start, stream) SHALL show an accessible message with the error code and a recovery action, and an idle Run tab SHALL explain how to start.

#### Scenario: Source unavailable
- **WHEN** loading the source fails
- **THEN** an alert with Retry is shown

### Requirement: Approval panel
The Run tab SHALL show an "Approval needed" panel for every pending approval with the tool name, arguments, message and expiry, and accessible Approve and Decline buttons; the status SHALL read "Waiting for your approval…" while any approval is pending.

#### Scenario: Approve from the browser
- **WHEN** a run requests approval and the learner presses Approve
- **THEN** the panel disappears, the timeline shows the resolution and the run continues to completion

#### Scenario: Decision fails
- **WHEN** posting the decision fails
- **THEN** the error is shown inside the panel, the buttons are re-enabled and the run is not marked finished

### Requirement: Conditional inputs in the Run tab
The Run tab SHALL render only the fields and select options whose `visibleWhen` condition holds for the current values, SHALL NOT submit hidden fields, and SHALL replace a selected option that becomes hidden with the first visible option.

#### Scenario: Field hidden
- **WHEN** the learner selects a model for which `temperature` is not visible
- **THEN** the temperature control disappears and the submitted input has no `temperature`

#### Scenario: Option becomes hidden
- **WHEN** the selected option of a select field becomes hidden after another field changes
- **THEN** the select switches to its first visible option

### Requirement: Live output for non-streaming runs
The Run tab SHALL show a finished run's complete answer in Live output when the run streamed no tokens, and label it as not streamed.

#### Scenario: Lab that uses generate()
- **WHEN** a lab run finishes without token events and its result output has a non-empty `text` or `answer`
- **THEN** Live output shows that text with a note that it was returned in one piece

#### Scenario: Streaming lab
- **WHEN** a lab run emits token events
- **THEN** Live output shows the streamed tokens and not the complete-answer note

### Requirement: Inspectable cited answers in the Run tab
The Run tab SHALL render a lab result's `citedAnswer` as claims with numbered citations that open the cited source passage with the quote highlighted.

#### Scenario: Open a source passage
- **WHEN** a learner activates citation [1] of a cited answer
- **THEN** a labelled dialog shows the source's title, location and full passage with the quoted span highlighted, and Escape or Close returns focus to the citation

#### Scenario: Unknown output shapes
- **WHEN** a result has no valid `citedAnswer`
- **THEN** the Run tab renders as before

### Requirement: Browser storage scoped per learner
Progress and scratch notes saved in the browser SHALL be stored under a scope derived from the signed-in learner, so another learner on the same browser never sees them.

#### Scenario: Second learner on a shared browser
- **WHEN** learner A saves progress and a scratch note, signs out, and learner B signs in on the same browser
- **THEN** B sees none of A's progress or notes, and A sees them again after signing back in

#### Scenario: Data saved before scoping
- **WHEN** a learner with no scoped data signs in and the browser holds unscoped progress or notes
- **THEN** that data moves to the learner once and is no longer shown when signed out

### Requirement: Chat presentation in the Run tab
For labs whose definition sets presentation to chat, the Run tab SHALL show a chat panel with thread history, a live streaming bubble, a Stop control that responds immediately, and Retry on a stopped or failed last turn.

#### Scenario: Stop while tokens stream
- **WHEN** the learner presses Stop during a streaming reply
- **THEN** the panel shows that it is stopping at once, the run is cancelled with its run token, and the partial reply appears as stopped within a second

#### Scenario: No duplicated tokens after a reconnect
- **WHEN** the event stream reconnects and the server replays events the panel already showed
- **THEN** each token appears once in the streaming bubble

### Requirement: Live workflow visualizer in the Run tab
When a run emits a workflow graph, the Run tab SHALL render it read-only with each node's live status from the run's workflow-step events, and an accessible list of the same steps and statuses.

#### Scenario: Step finishes
- **WHEN** a workflow-step success event arrives for a node
- **THEN** that node shows Done, and nodes that never ran show Skipped or Not reached once the run has finished
