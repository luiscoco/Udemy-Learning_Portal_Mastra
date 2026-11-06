import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLabRegistry } from './index.js';
import { resolveLabSourcePath, labsPackageDir } from './paths.js';
import type { SourceFile } from '@mlp/contracts';
import {
  INWORLD_SETTINGS,
  sourceForTour,
  tourIdentityText,
  tourModel,
  type RecordingKind,
} from '../../../apps/web/src/features/narration/content.js';
import { TourManifestSchema } from '../../../apps/web/src/features/narration/media.js';
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const definitions = createLabRegistry().definitions();
describe('Inworld prerecorded Mastra course tours', () => {
  it('covers every lesson with actual safe source, bounded ranges and correctly positioned timed rectangles', () => {
    expect(definitions).toHaveLength(76);
    for (const d of definitions) {
      const files: SourceFile[] = d.sourceFiles.map((f) => ({
        ...f,
        language: 'typescript',
        code: readFileSync(resolveLabSourcePath(d.id, f.path), 'utf8'),
      }));
      const exercise = tourModel(d, 'exercise');
      expect(exercise.steps).toHaveLength(6);
      expect(tourIdentityText(tourModel(d, 'walkthrough'))).toBe(tourIdentityText(exercise));
      const source = tourModel(d, 'source', files);
      expect(source.steps).toHaveLength(4);
      expect(source.file?.path).not.toBe(d.exercise.solutionFile);
      for (const s of source.steps) {
        expect(s.lines![0]).toBeGreaterThan(0);
        expect(s.lines![1]).toBeLessThanOrEqual(source.file!.code.split('\n').length);
      }
      for (const s of [...exercise.steps, ...tourModel(d, 'infographic').steps]) {
        expect(s.rect![0] + s.rect![2]).toBeLessThanOrEqual(1920);
        expect(s.rect![1] + s.rect![3]).toBeLessThanOrEqual(1080);
        expect(s.text.trim().length).toBeGreaterThan(40);
      }
      expect(
        sourceForTour(d, [{ path: d.exercise.solutionFile!, title: 'hidden', code: 'hidden', language: 'typescript' }]),
      ).toBeUndefined();
    }
  });
  it('ships content-bound Inworld Yash MP3s and valid word timings for all 228 tour entries', () => {
    const publicRoot = resolve(labsPackageDir(), '../../apps/web/public');
    for (const d of definitions) {
      const files: SourceFile[] = d.sourceFiles.map((f) => ({
        ...f,
        language: f.path.endsWith('.json') ? 'json' : 'typescript',
        code: readFileSync(resolveLabSourcePath(d.id, f.path), 'utf8'),
      }));
      const manifest = TourManifestSchema.parse(
        JSON.parse(readFileSync(resolve(publicRoot, `audio/tours/${d.id}.json`), 'utf8')),
      );
      expect(manifest.settings).toEqual(INWORLD_SETTINGS);
      expect(manifest.settings).not.toHaveProperty('language');
      for (const kind of ['exercise', 'source', 'infographic'] as RecordingKind[]) {
        const model = tourModel(d, kind, files);
        const recording = manifest.recordings[kind];
        expect(recording.identity, `${d.id}/${kind}`).toBe(digest(tourIdentityText(model)));
        expect(recording.clips).toHaveLength(model.steps.length);
        for (const [i, clip] of recording.clips.entries()) {
          expect(clip.textSha256).toBe(digest(model.steps[i]!.text));
          expect(clip.id).toBe(model.steps[i]!.id);
          expect(clip.audio).toBe(`/audio/tours/${clip.sha256}.mp3`);
          const bytes = readFileSync(resolve(publicRoot, clip.audio.slice(1)));
          expect(bytes.length).toBe(clip.bytes);
          expect(digest(bytes)).toBe(clip.sha256);
          expect(clip.words.length).toBeGreaterThan(0);
          let last = -1;
          for (const w of clip.words) {
            expect(w.start).toBeGreaterThanOrEqual(last);
            expect(w.end).toBeGreaterThanOrEqual(w.start);
            expect(w.end).toBeLessThanOrEqual(clip.duration + 0.3);
            last = w.start;
          }
        }
      }
    }
  }, 60000);
});
