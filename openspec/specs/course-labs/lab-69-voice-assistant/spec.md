# course-labs/lab-69-voice-assistant Specification

## Purpose
Define the Voice assistant lab (L69): optional speech-to-text and text-to-speech through Mastra voice providers (the official OpenAIVoice live, a MastraVoice simulator offline) on the server only, typed input that always works, an honest text fallback when audio is unavailable or fails, microphone and price notices, and confirmation of identifiers heard in speech.

## Requirements

### Requirement: Optional voice with a text fallback
Lab 69 SHALL accept typed text or audio, transcribe audio with an optional speech-to-text adapter, answer, and optionally speak the reply; whenever an audio service is unavailable or fails, the turn SHALL complete through text and state why.

#### Scenario: No audio service
- **WHEN** the voice provider is unavailable and the learner typed a message
- **THEN** the assistant answers the typed message as text and reports that the audio service was not used

#### Scenario: Audio only, transcription unavailable
- **WHEN** the learner sent only audio and transcription is unavailable
- **THEN** the assistant asks the learner to type the question and does not invent a transcript

### Requirement: Audio credentials and notices
Audio provider credentials SHALL stay on the server, and the lab SHALL show a microphone permission notice and a usage notice naming what the provider bills for the request.

#### Scenario: Live voice round trip
- **WHEN** the learner uses the OpenAI voice in live mode
- **THEN** no key or authorization header appears in the output or events, and the usage notice reports the characters spoken and the seconds transcribed

### Requirement: Identifiers from speech are confirmed
Identifiers recognized in a transcript SHALL be normalized and, when not heard exactly, presented for confirmation.

#### Scenario: Misheard order id
- **WHEN** the transcript contains "Ority 5001"
- **THEN** the answer refers to ORD-5001 and asks the learner to confirm it
