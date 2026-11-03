# course-labs/lab-70-interactive-agent-workspace Specification

## Purpose
Define the Interactive agent workspace lab (L70): one responsive screen combining the learner's own knowledge documents, a chat on a Mastra memory thread, and an inspector with live task progress, tool calls, the event trace and citations verified against the passages retrieved in the same turn.

## Requirements

### Requirement: One workspace for a grounded agent turn
Lab 70 SHALL answer a chat message on a learner-owned thread with an agent that plans tasks, searches the learner's knowledge documents and replies with claims that cite the passages it retrieved, reporting task progress, tool calls and the verified citations.

#### Scenario: Seeded question
- **WHEN** the learner seeds the sample documents and asks about refunds
- **THEN** every planned task ends done, searchDocs returns passages, and each shown claim quotes a passage returned in that turn

#### Scenario: Unsupported quote
- **WHEN** the model cites a quote that is not in any retrieved passage
- **THEN** that claim is blocked and reported, not shown as a cited answer

### Requirement: Knowledge stays per learner
The workspace SHALL search only the requesting learner's document library.

#### Scenario: Another learner
- **WHEN** a second learner asks before seeding
- **THEN** no seeded document of the first learner is listed or retrieved
