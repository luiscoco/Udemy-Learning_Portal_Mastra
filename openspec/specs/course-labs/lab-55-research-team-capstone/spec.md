# course-labs/lab-55-research-team-capstone Specification

## Purpose
TBD - created by archiving change lab-55-research-team-capstone. Update Purpose after archive.

## Requirements

### Requirement: Research team pipeline with surfaced evidence
Lab 55 SHALL research a question with a lead, one researcher per sub-question, a synthesizer and a fact-checker connected by a Mastra workflow, and SHALL surface every published claim's evidence as a verbatim quote located in its source.

#### Scenario: Sourced synthesis
- **WHEN** the example runs offline with the preset approver approving
- **THEN** at least two sub-questions are researched by separate researchers, every published claim cites a note whose quote is found in its source text, and `citedAnswer` matches the L44 contract

### Requirement: Unsupported claims flagged
The fact-check step SHALL flag every sentence that cites no note, cites a note that does not exist or is not supported by its cited note, and SHALL NOT publish a flagged sentence.

#### Scenario: Planted unsupported claim
- **WHEN** the planted claim is `unsupported-claim`
- **THEN** the planted sentence is flagged with a reason, appears under blocked claims, and is not in the published text

### Requirement: Human approval before publishing
The workflow SHALL suspend before publishing and SHALL publish only after an approve decision.

#### Scenario: Rejected
- **WHEN** the approver rejects
- **THEN** the workflow resumes into `publish` with status `rejected` and nothing is published

#### Scenario: Interactive approval
- **WHEN** the approver is set to ask during the run
- **THEN** the run waits in the Run tab approval panel and publishes only after the learner approves
