## ADDED Requirements

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
