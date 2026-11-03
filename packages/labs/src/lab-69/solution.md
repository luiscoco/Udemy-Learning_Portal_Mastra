# Voice assistant

Voice is optional on top of text. The server owns every provider call.

```ts
import { OpenAIVoice } from '@mastra/voice-openai'; // Mastra's official OpenAI voice (tts-1, whisper-1)

const voice = new OpenAIVoice({ speechModel: { name: 'tts-1' }, listeningModel: { name: 'whisper-1' }, speaker: 'alloy' });
// OPENAI_API_KEY is read from the SERVER environment; the browser only uploads audio and plays the reply.

let transcript: string | undefined;
try {
  transcript = await voice.listen(Readable.from([audioBytes]), { filetype: 'webm' });
} catch {
  // fall back below
}
const usedText = transcript ?? typedMessage ?? null; // never invent a transcript
if (!usedText) return askToType();

const answer = (await agent.generate(usedText)).text;
let reply;
try {
  reply = await collect(await voice.speak(answer.slice(0, 600)));
} catch {
  // text reply only
}
```

The offline provider extends Mastra's `MastraVoice`: `speak()` writes a WAV tone with the text in a RIFF `INFO/ICMT` chunk; `listen()` returns that text and refuses any other audio, so the fallback is easy to observe.

Identifiers from speech: `confirmIdentifiers()` maps “Ority 5001”, “order 5001”, “O R D 5001” to ORD-5001 but marks them unconfirmed; the assistant names the id and asks the user to confirm it.

Notices: before `getUserMedia({ audio: true })`, the page says the recording goes to the server and, in live mode, to OpenAI, and may be billed. After a live run, the usage notice reports the characters sent to speech and the seconds transcribed (measured for WAV; not guessed for compressed formats).

Challenge outline: `new CompositeVoice({ input: openAiVoice, output: new OfflineVoice() })` from `@mastra/core/voice`; wrap each direction in the same bounded port and report `services.stt` / `services.tts` with their own provider names.

Example input: the “Where is my order ORD-5001?” sample with the offline simulator. Expected: transcript used, the answer says ORD-5001 is shipped, and a short WAV reply.
