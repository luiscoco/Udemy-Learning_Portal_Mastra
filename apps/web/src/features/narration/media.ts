import { z } from 'zod';
import { INWORLD_SETTINGS, recordingKind, tourIdentityText, type TourModel } from './content';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const WordSchema = z.object({ text: z.string().max(300), start: z.number().nonnegative(), end: z.number().nonnegative() });
export const ClipSchema = z.object({
  id: z.string().max(40),
  textSha256: hash,
  sha256: hash,
  audio: z.string().regex(/^\/audio\/tours\/[a-f0-9]{64}\.mp3$/),
  bytes: z.number().int().positive().max(4_000_000),
  duration: z.number().positive().max(300),
  words: z.array(WordSchema).max(2000),
});
export type TourClip = z.infer<typeof ClipSchema>;
export const RecordingSchema = z.object({ identity: hash, clips: z.array(ClipSchema).min(1).max(12) });
export const TourManifestSchema = z.object({
  version: z.literal(1),
  lesson: z.string().regex(/^lab-\d{2}$/),
  settings: z.unknown(),
  recordings: z.object({ exercise: RecordingSchema, source: RecordingSchema, infographic: RecordingSchema }),
});
export type TourManifest = z.infer<typeof TourManifestSchema>;
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function boundedBytes(url: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('Recording unavailable. Read the caption or retry.');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Recording exceeds its verified size.');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function verifiedClip(
  model: TourModel,
  index: number,
  signal: AbortSignal,
): Promise<{ clip: TourClip; blob: Blob }> {
  const raw = await boundedBytes(`/audio/tours/${model.lesson}.json`, 300_000, signal);
  const manifest = TourManifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
  const record = manifest.recordings[recordingKind(model.kind)];
  if (
    manifest.lesson !== model.lesson ||
    JSON.stringify(manifest.settings) !== JSON.stringify(INWORLD_SETTINGS) ||
    record.identity !== (await sha256(tourIdentityText(model))) ||
    record.clips.length !== model.steps.length
  )
    throw new Error('The lesson or source has changed. Matching narration must be regenerated. Read the caption.');
  const clip = record.clips[index];
  const step = model.steps[index];
  if (
    !clip ||
    !step ||
    clip.id !== step.id ||
    clip.textSha256 !== (await sha256(step.text)) ||
    clip.audio !== `/audio/tours/${clip.sha256}.mp3`
  )
    throw new Error('Narration does not match this section. Read the caption.');
  let previous = -1;
  for (const word of clip.words) {
    if (word.start < previous || word.end < word.start || word.end > clip.duration + 0.3)
      throw new Error('Recording timings are invalid.');
    previous = word.start;
  }
  const bytes = await boundedBytes(clip.audio, clip.bytes, signal);
  if (bytes.length !== clip.bytes || (await sha256(bytes)) !== clip.sha256)
    throw new Error('Recording integrity check failed. Read the caption or retry.');
  return { clip, blob: new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }) };
}
