## ADDED Requirements

### Requirement: Safe formatted assistant responses
Assistant responses SHALL render Markdown headings, emphasis, lists, tables, inline code and fenced code in streaming and completed views, including standard runs, chat, agent workspace, voice and multi-agent conversations. Raw HTML SHALL NOT execute, unsafe links SHALL NOT navigate, and external response images SHALL NOT load. User messages and quoted citation evidence SHALL remain literal text.

#### Scenario: Formatted streamed response
- **WHEN** an assistant streams a response containing a heading, list and TypeScript fence
- **THEN** the response shows semantic formatted prose and coloured code without visible fence delimiters, preserving the partial answer during streaming

#### Scenario: Unsafe response markup
- **WHEN** a response contains script HTML, a javascript link or a remote image
- **THEN** it creates no executable HTML, unsafe navigation or image request

#### Scenario: Completed practical live checkpoint
- **WHEN** a run finishes without tokens and output.liveCheckpoint.answer contains text
- **THEN** Live output displays that answer using the same formatted response renderer

### Requirement: Consistent readable code blocks
Source files, response code fences and structured JSON inspectors SHALL use consistent syntax highlighting for supported languages, with unknown languages displayed as plain text. Response code SHALL identify its language and offer copying of the original code without line numbers. Long code lines and tables SHALL scroll within their container on mobile. Large blocks SHALL preserve their full content while bounding syntax-highlighting work.

#### Scenario: Copy response code
- **WHEN** a learner copies a fenced code block
- **THEN** the clipboard contains the original code and an accessible status confirms success or failure

#### Scenario: Unknown language and large block
- **WHEN** a fence uses an unknown language or exceeds the highlighting limit
- **THEN** its full code remains readable as plain text without executing or misclassifying it
