import { describe, expect, it } from 'vitest';
import { ExecutionEventSchema } from './events.js';
import { InstructorOutlineSchema, LabDefinitionSchema, LessonGuideSchema, QuizQuestionSchema } from './lab.js';
import { deriveProgressStatus, emptyProgress } from './progress.js';

const hints = [
  { level: 1, text: 'a' },
  { level: 2, text: 'b' },
  { level: 3, text: 'c' },
];
const guide = {
  procedure: ['one', 'two'],
  prediction: 'p',
  hints,
  commonMistakes: [{ mistake: 'm', fix: 'f' }],
  challenge: { prompt: 'c', successCriteria: ['s'] },
};

describe('LessonGuideSchema', () => {
  it('accepts exactly three ordered hints', () => {
    expect(LessonGuideSchema.parse(guide).hints.map((h) => h.level)).toEqual([1, 2, 3]);
  });
  it('rejects two hints', () => {
    expect(LessonGuideSchema.safeParse({ ...guide, hints: hints.slice(0, 2) }).success).toBe(false);
  });
  it('rejects out-of-order hints', () => {
    expect(LessonGuideSchema.safeParse({ ...guide, hints: [hints[1], hints[0], hints[2]] }).success).toBe(false);
  });
});

describe('QuizQuestionSchema', () => {
  it('rejects a correct index outside the choices', () => {
    const r = QuizQuestionSchema.safeParse({ id: 'q', prompt: 'p', choices: ['a', 'b'], correctIndex: 2, explanation: 'e' });
    expect(r.success).toBe(false);
  });
});

describe('InstructorOutlineSchema', () => {
  it('rejects outlines longer than 7 minutes', () => {
    const r = InstructorOutlineSchema.safeParse({
      durationMinutes: 8,
      segments: [
        { title: 'a', minutes: 4, talkingPoints: ['x'] },
        { title: 'b', minutes: 4, talkingPoints: ['y'] },
      ],
    });
    expect(r.success).toBe(false);
  });
  it('requires segment minutes to add up', () => {
    const r = InstructorOutlineSchema.safeParse({
      durationMinutes: 5,
      segments: [
        { title: 'a', minutes: 1, talkingPoints: ['x'] },
        { title: 'b', minutes: 1, talkingPoints: ['y'] },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('ExecutionEventSchema', () => {
  const base = { runId: 'r', correlationId: 'c', seq: 0, timestamp: new Date().toISOString() };
  it('parses a complete event', () => {
    expect(ExecutionEventSchema.parse({ ...base, type: 'complete', status: 'succeeded', durationMs: 3 }).type).toBe('complete');
  });
  it('rejects unknown event types', () => {
    expect(ExecutionEventSchema.safeParse({ ...base, type: 'debug' }).success).toBe(false);
  });
});

describe('deriveProgressStatus', () => {
  it('requires lesson, run, checks and passed quiz for completion', () => {
    const p = emptyProgress('lab-00');
    expect(deriveProgressStatus(p)).toBe('not-started');
    expect(deriveProgressStatus({ ...p, lessonRead: true })).toBe('in-progress');
    const quiz = { score: 3, total: 4, passed: true, attempts: 1, answers: {} };
    expect(deriveProgressStatus({ ...p, lessonRead: true, runSucceeded: true, checksPassed: true, quiz })).toBe('completed');
  });
});

describe('conditional input visibility', () => {
  const base = (inputs: unknown[]) => ({ ...makeDefinitionForVisibility(), inputs });
  const model = {
    kind: 'select',
    name: 'modelId',
    label: 'Model',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  };

  it('accepts a reference to an earlier field (on a field and on an option)', () => {
    const temperature = {
      kind: 'select',
      name: 'temperature',
      label: 'T',
      visibleWhen: { field: 'modelId', in: ['a'] },
      options: [{ value: '0', label: '0', visibleWhen: { field: 'modelId', in: ['a'] } }],
    };
    expect(LabDefinitionSchema.safeParse(base([model, temperature])).success).toBe(true);
  });

  it('rejects unknown, later or self references', () => {
    const bad = (visibleWhen: unknown, order: 'before' | 'after' = 'after') => {
      const t = { kind: 'text', name: 'note', label: 'N', maxLength: 10, visibleWhen };
      return LabDefinitionSchema.safeParse(base(order === 'after' ? [model, t] : [t, model]));
    };
    const unknown = bad({ field: 'nope', in: ['a'] });
    expect(unknown.success).toBe(false);
    expect(unknown.error?.issues[0]?.message).toContain('"nope"');
    expect(bad({ field: 'modelId', in: ['a'] }, 'before').success).toBe(false);
    expect(bad({ field: 'note', in: ['x'] }).success).toBe(false);
  });
});

/** A minimal valid definition (contracts cannot import the engine's test helpers). */
function makeDefinitionForVisibility() {
  const q = (id: string) => ({ id, prompt: 'p', choices: ['a', 'b'], correctIndex: 0, explanation: 'e' });
  return {
    id: 'lab-98',
    number: 98,
    title: 'T',
    moduleId: 'module-00',
    summary: 's',
    concept: 'c',
    objectives: ['a', 'b', 'c'],
    prerequisites: [],
    exampleInput: {},
    expectedOutput: { description: 'd', example: {} },
    guide,
    quiz: [q('q1'), q('q2'), q('q3')],
    sourceFiles: [{ path: 'run.ts', title: 'Run' }],
    exercise: { instructions: 'i' },
    checks: [{ id: 'c', label: 'C' }],
    instructorOutline: {
      durationMinutes: 3,
      segments: [
        { title: 's1', minutes: 1, talkingPoints: ['x'] },
        { title: 's2', minutes: 2, talkingPoints: ['y'] },
      ],
    },
    execution: { modes: ['offline'], defaultTimeoutMs: 1000, maxTimeoutMs: 2000, budget: {}, costNotice: 'free' },
  };
}
