# Design

## Voice adapters (`packages/labs/src/lab-69/voice.ts`)

- **`interface VoicePort { name; speak(text, { speaker, signal }): Promise<{ bytes: Buffer; mimeType }>; listen(audio: Buffer, { filetype, signal }): Promise<string> }`.**
- **`openAiPort(env)`** wraps `new OpenAIVoice({ speechModel: { name: 'tts-1' }, listeningModel: { name: 'whisper-1' }, speaker })`:
  - the speech stream is collected into a `Buffer` (MP3);
  - `listen` receives `Readable.from(buffer)` with `filetype` from the sniffed type;
  - each call races a 20 s timeout and the run signal.
- **`OfflineVoice extends MastraVoice`** (`@mastra/core/voice`):
  - `speak(text)` returns a 16 kHz mono PCM WAV: 0.4 s of a 440 Hz tone, then a `LIST/INFO/ICMT` chunk holding the UTF-8 text;
  - `listen(stream)` parses RIFF and returns ICMT; without it, it throws `VoiceUnavailable('offline simulator: not a lab sample clip')`;
  - `getSpeakers()` returns `[{ voiceId: 'sim' }]`.
- **`resolveVoice(choice, mode, env)`:**
  - `openai`: requires mode `live` and `OPENAI_API_KEY`; otherwise `unavailable` with a reason;
  - `offline`: always available;
  - faults (`stt-down`, `tts-down`) mark the corresponding direction as failing before any provider call.

## Audio input

- **Upload (`file` field `audio`, `maxFiles: 1`, `maxBytes: 1_000_000`, `record: true`):** the server decodes the base64 and sniffs the type (RIFF/WAVE, `ID3`/`0xFFFx` for MP3, `0x1A45DFA3` for WebM, `ftyp` for M4A). Anything else is rejected as `VALIDATION_FAILED`.
- **Sample:** one of three phrases.
  - Offline: `OfflineVoice.speak(phrase)` produces the clip, which `listen` then reads back.
  - Live: OpenAI `speak` produces the clip, and `listen` transcribes it (a true round trip, at small cost).

## Identifiers

`confirmIdentifiers(text)` finds `ORD[- ]?\d{4}` and the misheard forms `(ority|order|or d)\s*-?\s*(\d{4})`. It returns `{ normalized: 'ORD-5001', heard: 'Ority 5001', confirmed: exact }`. The answer is prefixed "I heard order ORD-5001 — please confirm." when an id is not exact.

## Agent

`Agent({ id: 'voiceDesk', instructions, model, voice })`. The voice instance is attached natively, but the lab calls the port explicitly so it can time and bound each direction. The offline script answers from `ORDERS` by the normalized id. The output text is capped at 600 characters for TTS.

## Output `voice: VoiceTurn`

```
{
  source: 'audio' | 'text' | 'none',
  transcript?: { text, provider, audioSeconds? },
  typedText?: string,
  usedText: string | null,
  identifiers: [{ heard, normalized, confirmed }],
  services: {
    stt: 'used' | 'unavailable' | 'failed' | 'not-needed',
    tts: 'used' | 'unavailable' | 'failed' | 'not-requested',
    provider: 'offline' | 'openai',
    reason?: string,
  },
  fallback: { used: boolean, reason?: string },
  answer: string | null,
  needsText: boolean,
  audio?: { mimeType, base64, bytes },
  usage: { speechCharacters, transcribedSeconds?, modelTokens? },
  notices: string[],
}
```

## Web

- **`VoiceTurn.tsx`:** renders when `output.voice` parses.
- **FileField recorder (`record: true`):**
  - "Record with microphone" shows a notice ("Your browser will ask for microphone access. The recording is sent to this platform's server and, in live mode, to OpenAI. Audio may be billed by the provider."), then `getUserMedia({ audio: true })` and a `MediaRecorder('audio/webm')` with Stop and a 30 s cap;
  - the recording is added as an `UploadedFile`;
  - when `MediaRecorder` is missing it shows "Recording is not supported in this browser — upload a file or type instead".
