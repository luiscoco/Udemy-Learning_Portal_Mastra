## ADDED Requirements

### Requirement: Research and editor agents orchestrated by a workflow
Lab 51 SHALL run a research agent and an editor agent as separate Mastra agents connected only through the steps of an explicit Mastra workflow, and SHALL show every handoff message, each intermediate output and the final result.

#### Scenario: Clean collaboration
- **WHEN** the example runs offline with no editor slip
- **THEN** the step path is research, draft, review-and-revise, publish, the draft is approved in the first review, every sentence of the published text cites a recorded note, and the transcript shows the task, the notes, the draft, the review and the final result

#### Scenario: Slip caught and revised
- **WHEN** the editor slip is `uncited-claim` and `maxRevisions` is 2
- **THEN** the first review reports the planted sentence, the editor revises once, the second review approves, and the published text does not contain the planted sentence

### Requirement: Bounded review loop
The review loop SHALL stop after at most `maxRevisions` revisions and SHALL NOT publish a draft with unresolved issues.

#### Scenario: No revisions allowed
- **WHEN** the editor slip is `unknown-citation` and `maxRevisions` is 0
- **THEN** the outcome is `needs-human` with the remaining issue, and no text is published
