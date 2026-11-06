import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createLabRegistry } from '../packages/labs/src/index.js';
import { resolveLabSourcePath } from '../packages/labs/src/paths.js';
import { INWORLD_SETTINGS, tourIdentityText, tourModel, type RecordingKind } from '../apps/web/src/features/narration/content.js';
import type { SourceFile } from '@mlp/contracts';
import { z } from 'zod';
import { ClipSchema, TourManifestSchema, type TourClip, type TourManifest } from '../apps/web/src/features/narration/media.js';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'apps/web/public/audio/tours');
const cache = join(root, '.data/narration-inworld');
const digest = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const ProviderResponseSchema = z.object({
  scriptResult: z.object({
    utterances: z
      .array(
        z.object({
          utteranceIndex: z.number().int().nonnegative(),
          audioContent: z.string().max(6_000_000),
          timestampInfo: z
            .object({
              wordAlignment: z.object({
                words: z.array(z.string()),
                wordStartTimeSeconds: z.array(z.number()),
                wordEndTimeSeconds: z.array(z.number()),
              }),
            })
            .optional(),
        }),
      )
      .max(100),
  }),
  usage: z.object({ processedCharactersCount: z.number().nonnegative().optional(), modelId: z.string().optional() }).optional(),
});
const only = process.argv.find((a) => a.startsWith('--lesson='))?.slice(9);
const shard = process.argv
  .find((a) => a.startsWith('--shard='))
  ?.slice(8)
  .split('/')
  .map(Number);
const dry = process.argv.includes('--dry-run');
if (!dry && existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const credential = process.env.INWORLD_API_KEY?.trim();
if (!dry && !credential)
  throw new Error('Set the authoring credential in the local root .env. Never put it in web configuration.');
mkdirSync(output, { recursive: true });
mkdirSync(cache, { recursive: true });
let characters = 0;
let calls = 0;
let reused = 0;
const definitions = createLabRegistry()
  .definitions()
  .filter((d) => (!only || d.id === only) && (!shard || d.number % shard[1]! === shard[0]));
if (!definitions.length) throw new Error('Unknown lesson');
for (const d of definitions) {
  const files: SourceFile[] = d.sourceFiles.map((f) => ({
    ...f,
    language: f.path.endsWith('.json') ? 'json' : 'typescript',
    code: readFileSync(resolveLabSourcePath(d.id, f.path), 'utf8'),
  }));
  const existingPath = join(output, `${d.id}.json`);
  if (!dry && existsSync(existingPath)) {
    const existing = TourManifestSchema.safeParse(JSON.parse(readFileSync(existingPath, 'utf8')));
    if (
      existing.success &&
      JSON.stringify(existing.data.settings) === JSON.stringify(INWORLD_SETTINGS) &&
      (['exercise', 'source', 'infographic'] as RecordingKind[]).every((kind) => {
        const record = existing.data.recordings[kind];
        const model = tourModel(d, kind, files);
        return (
          record.identity === digest(tourIdentityText(model)) &&
          record.clips.length === model.steps.length &&
          record.clips.every((clip, i) => {
            const path = join(output, `${clip.sha256}.mp3`);
            return (
              clip.id === model.steps[i]!.id &&
              clip.textSha256 === digest(model.steps[i]!.text) &&
              existsSync(path) &&
              digest(readFileSync(path)) === clip.sha256
            );
          })
        );
      })
    ) {
      reused += 3;
      console.log(`${d.id}: existing verified tours retained`);
      continue;
    }
  }
  const recordings = {} as TourManifest['recordings'];
  for (const kind of ['exercise', 'source', 'infographic'] as RecordingKind[]) {
    const model = tourModel(d, kind, files);
    if (!model.steps.length) throw new Error(`No source tour for ${d.id}`);
    const identity = digest(tourIdentityText(model));
    const groups: (typeof model.steps)[] = [];
    let group: typeof model.steps = [];
    let size = 0;
    for (const step of model.steps) {
      if (step.text.length > 2000) throw new Error('Section exceeds provider limit');
      if (size + step.text.length > 1950) {
        groups.push(group);
        group = [];
        size = 0;
      }
      group.push(step);
      size += step.text.length;
    }
    if (group.length) groups.push(group);
    const clips: TourClip[] = [];
    for (const steps of groups) {
      const request = {
        modelId: INWORLD_SETTINGS.modelId,
        enhanceGeneration: true,
        deliveryMode: INWORLD_SETTINGS.deliveryMode,
        audioConfig: INWORLD_SETTINGS.audioConfig,
        timestampType: 'WORD',
        outputMode: 'PER_UTTERANCE',
        script: { utterances: steps.map((s) => ({ text: s.text, voiceConfig: { voiceId: INWORLD_SETTINGS.voiceId } })) },
      };
      const key = digest(JSON.stringify(request));
      const saved = join(cache, `${key}.json`);
      if (dry) {
        characters += steps.reduce((n, s) => n + s.text.length, 0);
        continue;
      }
      let data: z.infer<typeof ProviderResponseSchema>;
      if (existsSync(saved)) {
        data = ProviderResponseSchema.parse(JSON.parse(readFileSync(saved, 'utf8')));
        reused++;
      } else {
        let response: Response | undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            response = await fetch('https://api.inworld.ai/tts/v1/voice', {
              method: 'POST',
              headers: { Authorization: `Basic ${credential}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
              signal: AbortSignal.timeout(120_000),
            });
          } catch {
            if (attempt === 3) throw new Error('Inworld network retries exhausted; completed recordings retained for resume.');
            await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
            continue;
          }
          if (response.ok || ![429, 502, 503, 504].includes(response.status)) break;
          await response.body?.cancel();
          await new Promise((r) => setTimeout(r, Math.min(30_000, 3000 * 2 ** attempt)));
        }
        if (!response?.ok)
          throw new Error(
            `Inworld synthesis HTTP ${response?.status ?? 'unavailable'}; completed recordings retained for resume.`,
          );
        data = ProviderResponseSchema.parse(await response.json());
        calls++;
        characters += data.usage?.processedCharactersCount ?? steps.reduce((n, s) => n + s.text.length, 0);
        writeFileSync(saved, JSON.stringify(data));
        writeFileSync(
          join(cache, 'usage.jsonl'),
          JSON.stringify({
            time: new Date().toISOString(),
            lesson: d.id,
            kind,
            characters: data.usage?.processedCharactersCount,
            request: key,
          }) + '\n',
          { flag: 'a' },
        );
      }
      const entries = data.scriptResult?.utterances;
      if (!entries || entries.length !== steps.length) throw new Error('Inworld returned incomplete section recordings');
      for (let i = 0; i < steps.length; i++) {
        const entry = entries.find((e) => e.utteranceIndex === i);
        if (!entry?.audioContent) throw new Error('Missing utterance audio');
        const bytes = Buffer.from(entry.audioContent, 'base64');
        const sha256 = digest(bytes);
        const path = join(output, `${sha256}.mp3`);
        writeFileSync(path, bytes);
        const probe = JSON.parse(
          execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate', '-of', 'json', path], {
            encoding: 'utf8',
            windowsHide: true,
          }),
        );
        if (Number(probe.streams?.[0]?.sample_rate) !== 48000)
          throw new Error('Provider did not return the requested 48 kHz recording');
        const duration = Number(probe.format.duration);
        const a = entry.timestampInfo?.wordAlignment;
        if (
          !a ||
          !a.words.length ||
          a.words.length !== a.wordStartTimeSeconds.length ||
          a.words.length !== a.wordEndTimeSeconds.length
        )
          throw new Error('Missing word alignment');
        const words = a.words.map((text, j) => ({ text, start: a.wordStartTimeSeconds[j]!, end: a.wordEndTimeSeconds[j]! }));
        clips.push(
          ClipSchema.parse({
            id: steps[i]!.id,
            textSha256: digest(steps[i]!.text),
            sha256,
            audio: `/audio/tours/${sha256}.mp3`,
            bytes: bytes.length,
            duration,
            words,
          }),
        );
      }
    }
    if (!dry) recordings[kind] = { identity, clips };
  }
  if (!dry) {
    const manifest = TourManifestSchema.parse({ version: 1, lesson: d.id, settings: INWORLD_SETTINGS, recordings });
    writeFileSync(join(output, `${d.id}.json`), JSON.stringify(manifest));
    console.log(`${d.id}: three verified Inworld tours saved`);
  }
}
console.log(
  JSON.stringify({
    lessons: definitions.length,
    calls,
    reused,
    processedCharacters: characters,
    estimatedOnDemandUSD: (characters * 25) / 1_000_000,
    dryRun: dry,
  }),
);
