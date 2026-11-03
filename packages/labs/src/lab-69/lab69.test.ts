import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab69Definition } from './definition.js';
import { confirmIdentifiers } from './identifiers.js';
import { Lab69InputSchema, lab69, type Lab69Output } from './run.js';
import { OfflineVoice, simulatedWav, sniffAudio, wavSeconds } from './voice.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab69]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());
const base = lab69Definition.exampleInput;

async function run(input: Record<string, unknown>) {
  const r = runner.start('lab-69', { input: { ...base, ...input } });
  const snap = await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result');
  const error = events.find((e) => e.type === 'error');
  return {
    snap,
    events,
    error,
    result: result?.type === 'result' ? result : undefined,
    out: (result?.type === 'result' ? result.output : undefined) as Lab69Output,
  };
}

describe('offline voice simulator', () => {
  it('round-trips its own clips, measures WAV length, and refuses other audio', async () => {
    const wav = simulatedWav('Where is my order ORD-5001?');
    expect(sniffAudio(wav)).toBe('wav');
    expect(wavSeconds(wav)).toBe(0.4);
    const voice = new OfflineVoice();
    expect(await voice.listen(Readable.from([wav]))).toBe('Where is my order ORD-5001?');
    const chunks: Buffer[] = [];
    for await (const c of (await voice.speak('Hello')) as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    const spoken = Buffer.concat(chunks);
    expect(await voice.listen(Readable.from([spoken]))).toBe('Hello');
    await expect(voice.listen(Readable.from([Buffer.from('ID3fake-mp3')]))).rejects.toThrow(/only read the lab’s sample clips/);
    expect(sniffAudio(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe('webm');
    expect(sniffAudio(Buffer.from('not audio at all'))).toBeNull();
  });
});

describe('identifiers from speech', () => {
  it('normalizes misheard order ids and marks them unconfirmed', () => {
    expect(confirmIdentifiers('Where is ORD-5001?')).toEqual([{ heard: 'ORD-5001', normalized: 'ORD-5001', confirmed: true }]);
    expect(confirmIdentifiers('Order Ority 5001 has shipped')).toEqual([
      { heard: 'Ority 5001', normalized: 'ORD-5001', confirmed: false },
    ]);
    expect(confirmIdentifiers('order number 5002 please').map((i) => i.normalized)).toEqual(['ORD-5002']);
    expect(confirmIdentifiers('nothing here')).toEqual([]);
  });
});

describe('Lab 69', () => {
  it('transcribes the sample, answers, and speaks the reply', async () => {
    const { snap, result, out } = await run({});
    expect(snap.status).toBe('succeeded');
    expect(result?.validation?.passed).toBe(true);
    expect(out.voice.transcript).toMatchObject({ text: 'Where is my order ORD-5001?', provider: 'offline', audioSeconds: 0.4 });
    expect(out.voice.answer).toMatch(/ORD-5001 \(Ceramic mug\) is shipped/);
    expect(out.voice.audio?.mimeType).toBe('audio/wav');
    expect(Buffer.from(out.voice.audio!.base64, 'base64').toString('ascii', 0, 4)).toBe('RIFF');
    expect(out.voice.usage.speechCharacters).toBe(out.voice.answer!.length);
  });

  it('a misheard id is named and confirmed', async () => {
    const { result, out } = await run({ sample: 'misheard' });
    expect(result?.validation?.passed).toBe(true);
    expect(out.voice.answer?.startsWith('I understood order ORD-5002. Please confirm that is right before I act on it. ')).toBe(
      true,
    );
    expect(out.voice.answer).toContain('ORD-5002 (Espresso machine) is packing');
  });

  it('falls back to text in every failure, and asks to type rather than guess', async () => {
    const typed = await run({ fault: 'stt-down', message: 'Where is ORD-5002?' });
    expect(typed.result?.validation?.passed).toBe(true);
    expect(typed.out.voice).toMatchObject({
      usedText: 'Where is ORD-5002?',
      fallback: { used: true },
      services: { stt: 'failed' },
    });
    const nothing = await run({ fault: 'stt-down' });
    expect(nothing.result?.validation?.passed).toBe(true);
    expect(nothing.out.voice).toMatchObject({ needsText: true, answer: null, usedText: null });
    expect(nothing.out.voice.transcript).toBeUndefined();
    const silent = await run({ fault: 'tts-down' });
    expect(silent.result?.validation?.passed).toBe(true);
    expect(silent.out.voice.audio).toBeUndefined();
    expect(silent.out.voice.answer).toBeTruthy();
    expect(silent.out.voice.notices.join(' ')).toMatch(/text only/);
    const noProvider = await run({ voice: 'openai', message: 'Where is ORD-5001?' });
    expect(noProvider.result?.validation?.passed).toBe(true);
    expect(noProvider.out.voice.services).toMatchObject({
      stt: 'unavailable',
      tts: 'unavailable',
      reason: 'OpenAI voice runs only in live mode.',
    });
    expect(noProvider.out.voice.answer).toMatch(/ORD-5001/);
  });

  it('an uploaded recording the simulator cannot read falls back honestly; non-audio is refused', async () => {
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200)]);
    const file = { name: 'rec.webm', type: 'audio/webm', size: webm.length, dataBase64: webm.toString('base64') };
    const up = await run({ audioSource: 'upload', audio: [file], message: 'Where is ORD-5001?' });
    expect(up.result?.validation?.passed).toBe(true);
    expect(up.out.voice).toMatchObject({ source: 'audio', services: { stt: 'failed' }, fallback: { used: true } });
    const bad = await run({ audioSource: 'upload', audio: [{ ...file, dataBase64: Buffer.from('hello').toString('base64') }] });
    expect(bad.snap.status).toBe('failed');
    expect(bad.error?.type === 'error' && bad.error.code).toBe('VALIDATION_FAILED');
  });

  it('validates inputs', () => {
    expect(Lab69InputSchema.safeParse({ ...base, audioSource: 'microphone' }).success).toBe(false);
    expect(Lab69InputSchema.safeParse({ ...base, message: 'x'.repeat(1_001) }).success).toBe(false);
  });
});
