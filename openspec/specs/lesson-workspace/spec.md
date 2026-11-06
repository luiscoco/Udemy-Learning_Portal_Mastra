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
Progress SHALL be saved through the storage adapter and survive reloads; a lab becomes completed only when the lesson is marked read, a run succeeded with all checks passing and the quiz is passed. Authenticated progress SHALL also survive changing browsers through account synchronization, with offline drafts and conflicts surfaced accessibly. Guest progress SHALL remain local and eligible for migration on sign-in.

#### Scenario: Reload keeps progress
- **WHEN** a learner completes Dummy Lab 00 and reloads the page
- **THEN** the lab and course progress still show it completed

#### Scenario: Progress from another browser
- **WHEN** the learner signs in from a second browser after a successful save
- **THEN** their completion, quiz, notes and self-check records are restored

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

### Requirement: Microphone recording with an explicit permission notice
A file input that requests recording SHALL show a notice about microphone access and where the audio goes before the browser asks for permission, and SHALL fall back to upload or typing when the browser cannot record.

#### Scenario: Browser without MediaRecorder
- **WHEN** the browser does not support recording
- **THEN** the recorder says so and the learner can still upload a file or type

### Requirement: Responsive agent workspace presentation
For labs whose presentation is workspace, the Run tab SHALL show knowledge documents, the chat, and an inspector with citations, tools, trace and live task progress in one screen, with a pane switcher on narrow screens, keyboard-accessible tabs, and no horizontal page scroll.

#### Scenario: Mobile width
- **WHEN** the workspace is shown on a phone-sized screen
- **THEN** one pane is visible at a time, the learner can switch panes, and the page does not scroll horizontally

### Requirement: Standard execution reattachment
Standard Run tabs SHALL restore a remembered execution after reload and offer explicit recovery of the learner's latest retained run. Browser storage SHALL contain only an account-scoped run identifier, never mutation capabilities or input payloads. Reattachment SHALL replay events without duplication and preserve live cancel/approval controls. Failed restoration and interrupted executions SHALL be surfaced accessibly without automatically starting a new execution.

#### Scenario: Reload while waiting for approval
- **WHEN** the learner reloads a standard Run tab during a live pending approval within the reconnect grace period
- **THEN** the same run and approval are restored and its decision uses a recovered capability

#### Scenario: Account changes
- **WHEN** learner A signs out and learner B signs in on the same browser
- **THEN** A's remembered run and late recovery responses do not appear in B's workspace

#### Scenario: Reset the local execution view
- **WHEN** the learner resets the execution view
- **THEN** its remembered run identifier is removed without deleting server history or starting another run

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

### Requirement: Supplementary visual study tabs
Every available lesson SHALL additionally render Infographic Content and Exercise Walkthrough tabs with deep links `?tab=infographic` and `?tab=walkthrough`. Existing Learn, Run and Source links, default selection and mounted exercise state SHALL be preserved. All tabs SHALL support keyboard navigation and fit narrow screens.

#### Scenario: Open a visual tab directly
- **WHEN** a learner opens either visual-tab deep link or its legacy lesson-query equivalent
- **THEN** the requested tab is selected and the correct lesson's content is displayed

#### Scenario: Return to an ongoing exercise
- **WHEN** a learner switches to visual guidance and back to Run
- **THEN** existing input, partial execution and cancellation controls remain available without a new run starting

### Requirement: Mastra-specific readable infographics
Each lesson SHALL provide distinct Mastra concept and exercise diagrams with full text summaries. Artwork SHALL follow the supplied white/pastel style and this portal's numbering and compatibility. Viewers SHALL support fit, zoom, pointer/keyboard pan or scroll, fullscreen with focus restoration, and image/text downloads. Diagrams SHALL be labelled as teaching content, require no provider calls or external assets, and never imply execution.

#### Scenario: Inspect and export a diagram
- **WHEN** a learner zooms, opens fullscreen or downloads an infographic
- **THEN** the correct lesson diagram remains readable, scrolls within its viewport and exports with its labels intact

#### Scenario: Export unavailable
- **WHEN** an image export fails
- **THEN** an accessible error appears and the SVG/text alternatives remain usable

### Requirement: Checked explanatory code excerpts
Visual guides SHALL include short syntax-coloured explanatory excerpts where applicable, copied from declared non-solution lesson reference files. They SHALL identify source provenance and omitted setup, provide readable code alongside the image, and preserve solution reveal boundaries.

#### Scenario: Read a teaching code excerpt
- **WHEN** an infographic includes code
- **THEN** syntax colours, source provenance and omitted-setup context are provided, and hidden exercise solutions remain hidden

### Requirement: Guided exercise phases
Exercise Walkthrough SHALL provide goal, preparation, baseline, evidence review, changed scenario and explanation phases using the lesson's actual example input, checks and challenge. It SHALL link to teaching/execution/source/notes sections without running code, changing current inputs, revealing hidden solutions or marking learner progress. Phase position SHALL survive tab changes within the current lesson and account.

#### Scenario: Walk through a lesson
- **WHEN** a learner selects phases or follows a guidance link
- **THEN** relevant lesson instructions and expected evidence appear without an execution, grade or progress change

### Requirement: Guided narrated study readers
Every lesson SHALL offer Guided Narrated Learning Tour launchers in Run, Source, Infographic Content and Exercise Walkthrough. Tours SHALL present the lesson's actual exercise guidance, checked non-solution source ranges or highlighted diagram regions with matching captions and prerecorded English MP3 narration. Reading and listening SHALL preserve learner inputs, execution state, hidden solutions and progress.

#### Scenario: Explore each learning surface
- **WHEN** a learner starts a tour in an exercise, source or visual tab
- **THEN** the correct lesson-specific reader opens with a highlighted section and matching caption, without starting or changing an exercise

### Requirement: Controllable recorded narration
Tours SHALL provide explicit playback, pause, resume, replay, previous/next, section selection, playback speed and close controls. Narration SHALL synchronize section highlighting to recorded segments. Exercise narration SHALL wait for manual progression; other tours SHALL offer optional automatic progression. Closing, changing view or unmounting SHALL stop playback and release media resources.

#### Scenario: Navigate and pause
- **WHEN** a learner selects a section, pauses, resumes or replays it
- **THEN** its matching recording and visual focus remain synchronized and no obsolete playback request can resume an earlier section

#### Scenario: Leave a tour
- **WHEN** a learner closes the reader, switches lesson/account or leaves its tab
- **THEN** narration stops and no late media response starts playback

### Requirement: Verified accessible tour media
Narration SHALL play only when its lesson/content identity, transcript and audio integrity match the current teaching material. Missing, stale, blocked or corrupt recordings SHALL show an accessible recovery message and preserve text/manual navigation. The responsive reader SHALL support keyboard controls, Escape and focus restoration. Source narration SHALL identify its reference file and line ranges without exposing solutions.

#### Scenario: Stale or unavailable recording
- **WHEN** recording metadata or bytes do not match, or playback fails
- **THEN** mismatched audio does not play, a retry or manual-reading action remains available, and the learner can still read the complete caption

#### Scenario: Keyboard and mobile use
- **WHEN** a learner uses the tour with a keyboard or narrow viewport
- **THEN** controls and captions remain reachable, code/images scroll within their container and Escape restores focus to the launcher

### Requirement: Timed red focus and vertical following
Recorded narration SHALL drive visible red outlines around the current exercise paragraph, source range, diagram region and spoken caption text. A Follow narration control SHALL keep the timed target visible through vertical scrolling without stealing focus from playback controls. Pausing, seeking, changing section and changing playback rate SHALL preserve the time mapping.

#### Scenario: Follow narrated content
- **WHEN** a timed target moves outside its scrollable reader while following is enabled
- **THEN** its reader scrolls to reveal it, the red outline follows the current audio time and disabling following leaves scrolling under learner control
