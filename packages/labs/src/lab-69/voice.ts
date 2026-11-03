import { Readable } from 'node:stream';
import { MastraVoice } from '@mastra/core/voice';
import { OpenAIVoice } from '@mastra/voice-openai';

export type AudioType = 'wav' | 'mp3' | 'webm' | 'm4a';
export const MIME: Record<AudioType, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', webm: 'audio/webm', m4a: 'audio/mp4' };

/** The audio type from the bytes themselves; the browser's declared type is never trusted. */
export function sniffAudio(b: Buffer): AudioType | null {
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (b.length >= 3 && (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0))) return 'mp3';
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  if (b.length >= 8 && b.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  return null;
}

/** Exact duration of a PCM WAV; other formats are not measured (and never guessed). */
export function wavSeconds(b: Buffer): number | undefined {
  if (sniffAudio(b) !== 'wav') return undefined;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
    if (id === 'data' && byteRate > 0) return Math.round((size / byteRate) * 100) / 100;
    off += 8 + size + (size % 2);
  }
  return undefined;
}

export class VoiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceUnavailable';
  }
}

const SAMPLE_RATE = 16_000;

/** A tiny PCM WAV: a 0.4 s 440 Hz tone, with the spoken text stored in a RIFF LIST/INFO/ICMT chunk. */
export function simulatedWav(text: string): Buffer {
  const samples = Math.round(SAMPLE_RATE * 0.4);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 8_000), i * 2);
  const comment = Buffer.from(`${text}\0`, 'utf8');
  const icmt = Buffer.concat([
    Buffer.from('ICMT'),
    u32(comment.length),
    comment,
    comment.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
  const list = Buffer.concat([Buffer.from('LIST'), u32(4 + icmt.length), Buffer.from('INFO'), icmt]);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(1, 10); // mono
  fmt.writeUInt32LE(SAMPLE_RATE, 12);
  fmt.writeUInt32LE(SAMPLE_RATE * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const data = Buffer.concat([Buffer.from('data'), u32(pcm.length), pcm]);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, list, data]);
  return Buffer.concat([Buffer.from('RIFF'), u32(body.length), body]);
}
function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function embeddedText(b: Buffer): string | null {
  if (sniffAudio(b) !== 'wav') return null;
  const at = b.indexOf('ICMT', 12, 'ascii');
  if (at < 0) return null;
  const size = b.readUInt32LE(at + 4);
  return b.toString('utf8', at + 8, at + 8 + size).replace(/\0+$/, '');
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer | string>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

/**
 * Offline voice simulator, built on Mastra's MastraVoice. Deterministic and honest: it "hears" only the
 * clips it produced itself (the text travels inside the WAV) and refuses any other audio.
 */
export class OfflineVoice extends MastraVoice {
  constructor() {
    super({ name: 'offline-voice-simulator' });
  }
  async speak(input: string | NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
    const text = typeof input === 'string' ? input : (await collect(input)).toString('utf8');
    return Readable.from([simulatedWav(text)]);
  }
  async listen(audio: NodeJS.ReadableStream | unknown): Promise<string> {
    const text = embeddedText(await collect(audio as NodeJS.ReadableStream));
    if (text === null)
      throw new VoiceUnavailable(
        'The offline simulator can only read the lab’s sample clips. Switch to live mode with OpenAI, or type your question.',
      );
    return text;
  }
  override async getSpeakers() {
    return [{ voiceId: 'sim' }];
  }
  override async getListener() {
    return { enabled: true };
  }
}

/** What the lab needs from a voice provider: bytes in and out, bounded by a timeout and the run signal. */
export interface VoicePort {
  provider: 'offline' | 'openai';
  speak(
    text: string,
    opts: { speaker?: string; signal: AbortSignal },
  ): Promise<{ bytes: Buffer; mimeType: 'audio/mpeg' | 'audio/wav' }>;
  listen(audio: Buffer, opts: { filetype: AudioType; signal: AbortSignal }): Promise<string>;
  voice: MastraVoice | OpenAIVoice;
}

const TIMEOUT_MS = 20_000;
function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const t = setTimeout(
        () => reject(new VoiceUnavailable(`The voice service did not answer within ${TIMEOUT_MS / 1000} s.`)),
        TIMEOUT_MS,
      );
      signal.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
      void work.finally(() => clearTimeout(t)).catch(() => undefined);
    }),
  ]);
}

export function offlinePort(): VoicePort {
  const voice = new OfflineVoice();
  return {
    provider: 'offline',
    voice,
    speak: async (text, { signal }) => ({ bytes: await bounded(voice.speak(text).then(collect), signal), mimeType: 'audio/wav' }),
    listen: (audio, { signal }) => bounded(voice.listen(Readable.from([audio])), signal),
  };
}

/** Mastra's official OpenAI voice (tts-1 / whisper-1). Uses OPENAI_API_KEY from the server environment only. */
export function openAiPort(speaker: string): VoicePort {
  const voice = new OpenAIVoice({ speechModel: { name: 'tts-1' }, listeningModel: { name: 'whisper-1' }, speaker });
  return {
    provider: 'openai',
    voice,
    speak: async (text, { speaker: s, signal }) => ({
      bytes: await bounded(voice.speak(text, { speaker: s ?? speaker }).then(collect), signal),
      mimeType: 'audio/mpeg',
    }),
    listen: (audio, { filetype, signal }) => bounded(voice.listen(Readable.from([audio]), { filetype }), signal),
  };
}

export type VoiceChoice = 'offline' | 'openai';
/** Which voice is usable here and now; never throws: an unavailable voice is a reason for the text fallback. */
export function resolveVoice(choice: VoiceChoice, mode: string, openAiConfigured: boolean, speaker: string) {
  if (choice === 'offline') return { port: offlinePort() as VoicePort, reason: undefined };
  if (mode !== 'live') return { port: null, reason: 'OpenAI voice runs only in live mode.' };
  if (!openAiConfigured) return { port: null, reason: 'No OpenAI key is configured on the server.' };
  return { port: openAiPort(speaker), reason: undefined };
}
