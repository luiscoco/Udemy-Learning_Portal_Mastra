import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const flags = z.record(z.string().max(120), z.boolean()).refine((value) => Object.keys(value).length <= 300);
export const PublishedAnswerSchema = z.object({
  id: z.string().max(100),
  labId: z.string().regex(/^lab-\d{2}$/),
  topic: z.string().max(200),
  question: z.string().max(2000),
  text: z.string().min(1).max(16000),
  mode: z.enum(['offline', 'live']),
  modelId: z.string().max(150).nullable(),
  at: z.iso.datetime(),
});
export type PublishedAnswer = z.infer<typeof PublishedAnswerSchema>;
export const AttemptSchema = z.object({
  id: z.string().max(100),
  labId: z.string().regex(/^lab-\d{2}$/),
  mode: z.enum(['offline', 'live']),
  status: z.string().max(40),
  at: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  passed: z.boolean(),
  checks: z.string().max(6000),
  output: z.string().max(12000),
  review: flags,
});
export type ProjectAttempt = z.infer<typeof AttemptSchema>;
export const ProjectStateSchema = z.object({
  version: z.literal(1),
  textSize: z.enum(['100', '110', '125', '150']).default('100'),
  stages: flags,
  recognition: flags,
  notes: z.string().max(20000),
  attempts: z.array(AttemptSchema).max(40),
  answers: z.array(PublishedAnswerSchema).max(10),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
export const emptyProjectState = (): ProjectState => ({
  version: 1,
  textSize: '100',
  stages: {},
  recognition: {},
  notes: '',
  attempts: [],
  answers: [],
});
export const projectStorageKey = (scope: string, id: string) => `mlp.milestones.v1:${encodeURIComponent(scope)}:${id}`;
export function loadProjectState(key: string): { data: ProjectState; warning: string } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { data: emptyProjectState(), warning: '' };
    if (raw.length > 1500000) throw new Error('Oversized backup');
    return { data: ProjectStateSchema.parse(JSON.parse(raw)), warning: '' };
  } catch {
    return {
      data: emptyProjectState(),
      warning: 'Saved project data is unavailable or invalid. Current work stays in memory; export a JSON backup.',
    };
  }
}
/** Only project evidence, never credentials or run capabilities. Parent keys isolate learner/project changes. */
export function useProjectState(key: string) {
  const [saved, setSaved] = useState(() => loadProjectState(key));
  const current = useRef(saved.data);
  const update = useCallback(
    (change: (previous: ProjectState) => ProjectState) => {
      const data = ProjectStateSchema.parse(change(current.current));
      current.current = data;
      let warning = '';
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        warning = 'Browser storage could not save this change. Keep this tab open and export a JSON backup.';
      }
      setSaved({ data, warning });
    },
    [key],
  );
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      const next = loadProjectState(key);
      current.current = next.data;
      setSaved(next);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [key]);
  return { ...saved, update };
}
