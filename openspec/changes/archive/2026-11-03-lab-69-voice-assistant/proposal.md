# Proposal

## Why

The L69 DoD: integrate optional speech-to-text (STT) and text-to-speech (TTS) adapters with clear permission and price notices, typed input and a text fallback. The fallback must work without any audio service, and audio credentials must stay on the server.

Findings with @mastra/core 1.78.0:

- **Voice API.** Mastra exposes a voice abstraction (`MastraVoice` with `speak` and `listen`; `CompositeVoice({ input, output })`; AI SDK wrappers), and an `Agent` accepts `voice`.
- **No speech models in the router.** The model router has no speech or transcription models, so live audio needs a provider package.
- **The official package.** `@mastra/voice-openai` 0.13.4 (published 2026-10-28; depends on `openai` 6.49.0) provides `OpenAIVoice` with the documented models `tts-1`/`tts-1-hd` and `whisper-1`.
- **A live spike** (pinned 0.13.4, real key):
  - `speak()` returned 62 KB of MP3 in about 3 s;
  - `listen()` transcribed it back in about 1.4 s as "Hello from the Voice Lab. Order **Ority** 5001 has shipped.";
  - so transcripts are imperfect, and identifiers taken from speech must be confirmed;
  - `new Agent({ voice })` keeps the instance as `agent.voice`.

## What Changes

- **Dependency.** `@mastra/voice-openai` 0.13.4, exact, in `@mlp/labs` (server only; the web lint rule already forbids `@mastra/*`).
- **Contracts (additive):**
  - a file input may set `record: true` to offer an in-browser microphone recorder;
  - `VoiceTurnSchema` for `output.voice`: transcript, source, services, fallback, notices, audio reply and usage.
- **New lab `lab-69` (Module 14): a voice support assistant.**
  - **Voice adapters (server side):**
    - **`openai`:** `OpenAIVoice`, available only in live mode with `OPENAI_API_KEY` configured;
    - **`offline`:** `OfflineVoice extends MastraVoice` (from `@mastra/core/voice`). It is deterministic: `speak()` returns a short WAV tone with the text embedded in a RIFF INFO chunk, and `listen()` returns that embedded text. For any other audio it fails with "the offline simulator can only read the lab's sample clips". It is labelled as a simulator.
  - **Inputs:**
    - typed message (always available);
    - audio source: none, a sample phrase or an upload (`.wav`, `.mp3`, `.webm`, `.m4a`, up to 1 MB, with recording offered);
    - speak the reply (yes or no);
    - voice: offline simulator or OpenAI;
    - speaker;
    - fault: none, `stt-down` or `tts-down` (injected before any provider call);
    - model.
  - **Flow:**
    1. Resolve voice availability.
    2. STT with a timeout. On failure or unavailability, fall back to the typed text; with no typed text either, ask for it and never invent a transcript.
    3. Confirm identifiers: `ORD-dddd` patterns, including misheard forms such as "Ority 5001", are normalized and reported as needing confirmation.
    4. The agent answers. Offline uses a scripted answer from the lab's order table; live uses the learner's model.
    5. Optional TTS (at most 600 characters): base64 MP3 or WAV in the output, otherwise a text-only answer stating why.
  - **Notices:** the microphone permission text in the UI; a price notice that names what is billed (characters to speech, audio seconds to transcription, model tokens) and the counts for this request, without invented prices; an explicit statement that audio goes to the platform's server and, in live mode, to OpenAI.
  - **Checks:**
    - `input-resolved` (an answer from a transcript or typed text, or an honest request to type);
    - `fallback-honest`;
    - `identifiers-confirmed`;
    - `audio-bounded`;
    - `credentials-server-side` (no key or authorization in the output or events; the provider is called by the server only);
    - `reply-delivered` (audio when spoken and available, otherwise text with a reason).
- **Web:**
  - a `VoiceTurn` renderer (transcript with its source, confirmation notes, answer, `<audio controls>` for the reply, services and fallback);
  - a microphone recorder in `FileField` when `record` is set: an explicit Start button with a permission notice, `MediaRecorder` producing WebM, and an "unsupported" message when the browser has no recorder;
  - no audio code talks to a provider.
- **Tests:**
  - offline voice (WAV round trip, refusal of other audio);
  - identifier confirmation;
  - fallback matrix (STT down, TTS down, no key, upload offline, nothing typed);
  - component tests (renderer, recorder with a fake `MediaRecorder`, unsupported browser);
  - e2e (sample clip offline; audio player appears; fallback);
  - a live check (OpenAI voice round trip and answer).
- **Docs:** a COMPATIBILITY row; RELEASE-GATES entries for upload malware scanning and retention, which also apply to audio.
