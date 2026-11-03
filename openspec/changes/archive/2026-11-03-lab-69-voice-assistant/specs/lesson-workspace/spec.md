## ADDED Requirements

### Requirement: Microphone recording with an explicit permission notice
A file input that requests recording SHALL show a notice about microphone access and where the audio goes before the browser asks for permission, and SHALL fall back to upload or typing when the browser cannot record.

#### Scenario: Browser without MediaRecorder
- **WHEN** the browser does not support recording
- **THEN** the recorder says so and the learner can still upload a file or type
