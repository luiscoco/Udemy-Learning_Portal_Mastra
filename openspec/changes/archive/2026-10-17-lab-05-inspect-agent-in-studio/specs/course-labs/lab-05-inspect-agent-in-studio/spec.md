## ADDED Requirements

### Requirement: Real local Studio session
The repository SHALL provide a reference Mastra project and an `npm run studio` script that starts `mastra dev`, and Lab 05 SHALL confirm a running Studio by calling its `/api/agents` endpoint and detecting the Studio page.

#### Scenario: Studio running
- **WHEN** Studio runs at http://localhost:4111 and the lab runs with target `local`
- **THEN** all checks pass and the result reports the agent's provider and model

#### Scenario: Studio not running
- **WHEN** nothing listens on the given port
- **THEN** the run completes with the "Studio API answered" check failed and a hint to run `npm run studio`

### Requirement: Safe probing, no embedding
The server SHALL only probe loopback http origins on ports 1024–65535 without paths, with a timeout and no redirects; probing SHALL be disabled in production; the UI SHALL present Studio as a link opened in its own tab and never embed it.

#### Scenario: Non-loopback rejected
- **WHEN** the Studio URL is `http://10.0.0.5:4111`
- **THEN** the request fails with `VALIDATION_FAILED`

### Requirement: Recorded response
The lab SHALL include a recorded `/api/agents` response captured from the pinned Mastra version and kept consistent with the reference project.

#### Scenario: Recorded target
- **WHEN** the lab runs with target `recorded`
- **THEN** it reports `assistant-agent` with provider `openai` and model `gpt-5-mini`
