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
