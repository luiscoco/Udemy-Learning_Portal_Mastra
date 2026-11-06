# lesson-tutor Specification

## Purpose
Provide optional lesson-grounded programming guidance throughout the course with explicit offline/live provenance, safe incremental answers and accessible controls.

## Requirements

### Requirement: Lesson-aware tutor access
Every available lesson SHALL offer AI Tutor with its current title, relevant example questions, a bounded question field and readable formatted answers. Each question SHALL start a fresh tutor request grounded in server-owned lesson teaching content. Tutor use SHALL NOT change progress, quiz scores or lab results.

#### Scenario: Ask about the current lesson
- **WHEN** a learner opens AI Tutor from a lesson and asks for help
- **THEN** the panel identifies that lesson and answers with lesson context, headings and coloured code when present

### Requirement: Explicit free and paid modes
Tutor SHALL default to free deterministic offline guidance and offer live calls only when the server and an allowlisted provider model are configured. Live usage SHALL disclose charges before submission and SHALL NOT silently substitute offline text on provider failure. Configuration presence SHALL NOT claim verified access or billing.

#### Scenario: Offline help without keys
- **WHEN** a signed-in learner submits an offline question with no provider credentials
- **THEN** lesson-specific authored guidance streams without provider calls and is labelled as simulated guidance

#### Scenario: Live provider is unavailable
- **WHEN** a live request is disabled, invalid, unconfigured or rejected by a provider
- **THEN** a safe actionable non-success state appears and retry requires an explicit learner action

### Requirement: Protected bounded tutor execution
Tutor execution SHALL require the current authenticated account and matching caller identity, same-origin protections, bounded validated inputs, server-owned context, rate/concurrency admission, deadlines and masked secrets. It SHALL NOT execute student code or expose tools, provider credentials, quiz answer keys or solution files.

#### Scenario: Invalid or cross-account submission
- **WHEN** a request lacks authentication, has a mismatched subject, unknown lesson, excessive question or unsupported fields
- **THEN** it is rejected before calling a provider

#### Scenario: Execution exceeds limits
- **WHEN** tutor concurrency, rate, output or time limits are reached
- **THEN** execution is refused or terminated with a safe error and resources are released

### Requirement: Explicit stream lifecycle and accessible controls
Tutor SHALL show incremental output and distinguish complete, stopped, timeout, failure and interrupted streams. Only an explicit valid completion after a nonempty answer SHALL establish success. Stop, close, navigation and account changes SHALL abort observation and guard against late updates. Stop SHALL NOT claim confirmed remote cancellation. Controls SHALL be keyboard accessible, restore launcher focus on close and fit mobile viewports in both themes.

#### Scenario: Stop or close during streaming
- **WHEN** a learner stops or closes an active tutor
- **THEN** observation stops immediately, the request is aborted, late events cannot alter a newer request and closing restores launcher focus

#### Scenario: Connection ends before completion
- **WHEN** the connection ends or produces malformed events without a valid terminal outcome
- **THEN** partial text remains visibly incomplete and no automatic paid retry occurs
