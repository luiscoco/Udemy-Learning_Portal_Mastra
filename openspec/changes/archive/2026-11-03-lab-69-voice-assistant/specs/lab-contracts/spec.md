## ADDED Requirements

### Requirement: Voice turn contract and recordable file inputs
A file input SHALL be able to request an in-browser recorder, and a voice turn schema SHALL describe the transcript, the services used, the fallback, the reply audio and the usage of a voice lab.

#### Scenario: Existing file inputs
- **WHEN** a file input omits record
- **THEN** it validates unchanged and shows no recorder
