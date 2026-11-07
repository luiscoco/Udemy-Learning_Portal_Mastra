# platform/milestone-projects Specification

## Purpose
Connect the Mastra course to cumulative Study Coach, Evaluation Studio and Publishing Studio applications with guided build stages, inspectable execution evidence and reviewable artifacts.

## Requirements

### Requirement: Discoverable cumulative project paths
The portal SHALL expose three named project workspaces through a projects hub, Home and navigation. It SHALL provide 22 ordered build stages with copyable prompts, related lessons, deliverables and evidence checks. Opening a reference or checking a project criterion SHALL NOT complete a course lesson.

#### Scenario: Start a milestone
- **WHEN** a learner opens Milestone projects
- **THEN** the three projects show their purpose, build stages and working preview links without changing lab order or progress

### Requirement: Guided Mastra study
Study Coach SHALL offer searchable, sectioned course topics with concept explanations, safe source inspection, editable question shortcuts and recognition feedback. Offline guidance SHALL be clearly authored; live guidance SHALL use configured server models with fresh explicit consent.

#### Scenario: Practise a concept
- **WHEN** a learner selects a topic, inspects its source and answers a recognition check
- **THEN** feedback and project evidence are recorded separately from the linked lesson

### Requirement: Inspectable evaluation evidence
Evaluation Studio SHALL execute registered lesson cases through the authenticated typed API. It SHALL support editable validated inputs, offline/live provenance, event inspection, objective checks, cancellation and required approvals. History SHALL retain bounded summaries and manual review evidence without treating a successful run as mastery.

#### Scenario: Evaluate and review
- **WHEN** a learner explicitly runs a case
- **THEN** actual execution events, status and checks are displayed and a bounded attempt summary can be reviewed or exported

### Requirement: Selected-answer publishing
Publishing Studio SHALL publish only a selected completed answer into Word, PDF, Markdown and SVG/PNG artifacts. Exports SHALL retain answer identity and offline/live provenance, escape untrusted content and include readable code. Infographics SHALL identify excerpts. Local PNG references SHALL remain bounded and SHALL NOT trigger a provider call.

#### Scenario: Publish one response
- **WHEN** a learner selects a completed answer and exports it
- **THEN** every artifact is derived from that selected response and never substitutes a later draft or incomplete stream

### Requirement: Isolated resilient project state
Project stage evidence, recognition feedback and bounded history SHALL persist per local learner in browser storage with visible storage errors and JSON backup. Account or project changes SHALL isolate state and cancel observation. No credential or run capability SHALL be persisted. Paid requests SHALL never retry automatically.

#### Scenario: Switch learners or reload
- **WHEN** a learner changes account or reloads a project
- **THEN** only that learner's project evidence is restored, while lab progress and other accounts remain unchanged

### Requirement: Safe accessible project controls
Project interfaces SHALL provide labelled keyboard controls, progress and error states, visible focus and responsive light/dark layouts. Server authentication, validation, limits and secret masking SHALL remain in force. Student code SHALL never execute in the API process.

#### Scenario: Unavailable or stopped execution
- **WHEN** a request fails, stops or lacks a configured model
- **THEN** the workspace shows its actual non-success state and requires a fresh explicit action before another paid call
