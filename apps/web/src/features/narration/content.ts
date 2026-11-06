import type { LabDefinition, SourceFile } from '@mlp/contracts';
import { CONCEPT_FLOWS, teachingExcerpt, walkthroughPhases } from '../visual-guides/content';

export type TourKind = 'exercise' | 'source' | 'infographic' | 'walkthrough';
export type RecordingKind = Exclude<TourKind, 'walkthrough'>;
export type TourRect = readonly [number, number, number, number];
export interface TourStep {
  id: string;
  title: string;
  text: string;
  lines?: readonly [number, number];
  rect?: TourRect;
}
export interface TourModel {
  lesson: string;
  kind: TourKind;
  title: string;
  steps: TourStep[];
  file?: SourceFile;
}
export const recordingKind = (kind: TourKind): RecordingKind => (kind === 'walkthrough' ? 'exercise' : kind);
export const INWORLD_SETTINGS = {
  voiceId: 'Yash',
  modelId: 'inworld-tts-2',
  enhanceGeneration: true,
  deliveryMode: 'BALANCED',
  audioConfig: { speakingRate: 1.25, audioEncoding: 'MP3', sampleRateHertz: 48000 },
} as const;
const short = (text: string, limit = 230) => {
  const clean = text.replace(/[`*#]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean
    .slice(0, limit)
    .replace(/\s+\S*$/, '')
    .replace(/[,:;.]$/, '');
  return `${cut}.`;
};
export function sourceForTour(d: LabDefinition, files: SourceFile[]): SourceFile | undefined {
  const declared = new Set(d.sourceFiles.map((f) => f.path));
  const safe = files.filter(
    (f) => declared.has(f.path) && f.path !== d.exercise.solutionFile && !/solution/i.test(f.path) && /\.tsx?$/.test(f.path),
  );
  return safe.find((f) => f.path === 'run.ts') ?? safe[0];
}
export function tourModel(d: LabDefinition, kind: TourKind, files: SourceFile[] = []): TourModel {
  const base: TourModel = {
    lesson: d.id,
    kind,
    title: `${d.title} · ${kind === 'source' ? 'TypeScript source' : kind === 'infographic' ? 'Infographic' : 'Exercise'}`,
    steps: [],
  };
  if (kind === 'exercise' || kind === 'walkthrough') {
    base.steps = walkthroughPhases(d).map((phase, i) => ({
      id: `phase-${i}`,
      title: phase.title,
      text: `${phase.title}. ${short(phase.summary, 190)} ${i === 2 ? 'Inspect the example input. Close the tour and press Run yourself when ready.' : i === 3 ? short(d.checks.map((c) => c.label).join('. '), 125) : i === 5 ? 'Listening does not mark this lesson complete. Record your own evidence in My notes.' : short(phase.details[0] ?? '', 110)}`,
      rect: [35 + (i % 3) * 625, 215 + Math.floor(i / 3) * 213, 600, 190],
    }));
  } else if (kind === 'infographic') {
    base.steps = (CONCEPT_FLOWS[d.number] ?? []).map((title, i) => ({
      id: `concept-${i}`,
      title,
      text: `${title}. ${short(d.objectives[i % d.objectives.length]!, 230)} ${i === 3 ? short(d.expectedOutput.description, 100) : 'Follow this stage in the highlighted panel, then compare it with the next stage.'}`,
      rect: [1190, 296 + i * 136, 665, 115],
    }));
    base.steps.push({
      id: 'code',
      title: 'Connect the concept to code',
      text: `Connect the concept to code. ${short(d.concept, 240)} The teaching excerpt omits surrounding setup. Open Source to inspect the complete reference.`,
      rect: [59, 419, 1052, 377],
    });
  } else {
    const file = sourceForTour(d, files);
    if (!file) return base;
    base.file = file;
    const lines = file.code.replace(/\r\n/g, '\n').split('\n');
    const find = (pattern: RegExp, from = 0) =>
      Math.max(
        0,
        lines.findIndex((line, i) => i >= from && pattern.test(line)),
      );
    const input = find(/(?:export\s+)?const\s+\w*(?:Input|Schema)\w*\s*=|z\.(?:strictObject|object)\(/);
    const execution = find(/async run\(|async function run|run:\s*async/);
    const native = teachingExcerpt(d, [file])?.line ?? execution + 1;
    const evidence = find(/validate\s*\(|validate:|checks\s*:/, execution + 1);
    const entries: [string, number, string][] = [
      [
        'Read the input contract',
        input,
        `Read the input contract in ${file.path}. ${d.prerequisites.length ? `Review ${d.prerequisites.join(', ')} first.` : 'No earlier lesson is required.'} Inputs are validated before execution; compare these definitions with the exercise fields.`,
      ],
      [
        'Follow the implementation',
        Math.max(0, native - 1),
        `Follow the implementation in ${file.path}. ${short(d.concept, 210)} Surrounding imports and setup remain visible in the full file.`,
      ],
      [
        'Trace execution',
        execution,
        `Trace execution in ${file.path}. ${short(d.guide.procedure.slice(1, 3).join(' '), 210)} Read the highlighted lines alongside the complete implementation.`,
      ],
      [
        'Connect code to evidence',
        evidence,
        `Connect code to evidence. ${short(d.expectedOutput.description, 170)} ${short(d.checks.map((c) => c.label).join('. '), 110)} These are expected checks, not a recorded run.`,
      ],
    ];
    base.steps = entries.map(([title, start, text], i) => ({
      id: `source-${i}`,
      title,
      text,
      lines: [start + 1, Math.min(lines.length, start + 12)],
    }));
  }
  return base;
}
/** Both exercise surfaces intentionally share narration; source identity includes the complete checked reference. */
export function tourIdentityText(model: TourModel): string {
  return JSON.stringify({
    version: 1,
    lesson: model.lesson,
    kind: recordingKind(model.kind),
    steps: model.steps.map(({ id, title, text, lines }) => ({ id, title, text, lines })),
    source: model.file ? { path: model.file.path, code: model.file.code.replace(/\r\n/g, '\n') } : null,
  });
}
