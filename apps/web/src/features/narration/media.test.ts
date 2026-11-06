import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lab03Definition as d } from '../../../../../packages/labs/src/lab-03/definition';
import { INWORLD_SETTINGS, tourIdentityText, tourModel } from './content';
import { boundedBytes, sha256, verifiedClip, type TourManifest } from './media';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const model = tourModel(d, 'exercise');
  const bytes = new TextEncoder().encode('test MP3 bytes');
  const sha = await sha256(bytes);
  const clips = await Promise.all(
    model.steps.map(async (s) => ({
      id: s.id,
      textSha256: await sha256(s.text),
      sha256: sha,
      audio: `/audio/tours/${sha}.mp3`,
      bytes: bytes.length,
      duration: 2,
      words: [{ text: 'Test', start: 0, end: 1 }],
    })),
  );
  const record = { identity: await sha256(tourIdentityText(model)), clips };
  const manifest: TourManifest = {
    version: 1,
    lesson: d.id,
    settings: INWORLD_SETTINGS,
    recordings: { exercise: record, source: record, infographic: record },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.endsWith('.json') ? new Response(JSON.stringify(manifest)) : new Response(bytes))),
  );
  return { model, manifest, bytes };
}
it('verifies caption, settings, lesson identity and MP3 bytes before returning playable media', async () => {
  const { model } = await fixture();
  const { clip, blob } = await verifiedClip(model, 0, new AbortController().signal);
  expect(clip.id).toBe('phase-0');
  expect(blob.type).toBe('audio/mpeg');
});
it('rejects stale captions/settings and a remote audio path before playback', async () => {
  const { model, manifest } = await fixture();
  manifest.settings = { ...INWORLD_SETTINGS, voiceId: 'Other' };
  await expect(verifiedClip(model, 0, new AbortController().signal)).rejects.toThrow('changed');
  manifest.settings = INWORLD_SETTINGS;
  manifest.recordings.exercise.clips[0]!.audio = 'https://example.com/audio.mp3';
  await expect(verifiedClip(model, 0, new AbortController().signal)).rejects.toThrow();
});
it('rejects corrupted MP3 data and oversized streamed responses', async () => {
  const { model, manifest } = await fixture();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('.json') ? new Response(JSON.stringify(manifest)) : new Response('corrupted MP3!'),
    ),
  );
  await expect(verifiedClip(model, 0, new AbortController().signal)).rejects.toThrow('integrity');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('too many bytes')),
  );
  await expect(boundedBytes('/audio/tours/test', 3, new AbortController().signal)).rejects.toThrow('size');
});
