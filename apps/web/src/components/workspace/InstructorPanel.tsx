import type { LabDefinition } from '@mlp/contracts';
import { downloadText } from '../../lib/download';
import { Button } from '../ui/primitives';

export function instructorExport(def: LabDefinition) {
  return {
    format: 'mlp-instructor-script/v1',
    labId: def.id,
    title: def.title,
    moduleId: def.moduleId,
    summary: def.summary,
    objectives: def.objectives,
    outline: def.instructorOutline,
    procedure: def.guide.procedure,
    checks: def.checks,
    quiz: def.quiz.map((q) => ({ prompt: q.prompt, answer: q.choices[q.correctIndex], explanation: q.explanation })),
    costNotice: def.execution.costNotice,
  };
}

export function InstructorPanel({ definition }: { definition: LabDefinition }) {
  const o = definition.instructorOutline;
  return (
    <details className="rounded-xl border border-border bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Instructor script · {o.durationMinutes} min video</summary>
      <ol className="mt-4 flex flex-col gap-3">
        {o.segments.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-border p-3">
            <p className="font-medium">
              {i + 1}. {s.title} <span className="text-sm font-normal text-fg-muted">({s.minutes} min)</span>
            </p>
            <ul className="mt-1 list-disc pl-6 text-sm text-fg-muted">
              {s.talkingPoints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() =>
          downloadText(
            `${definition.id}-instructor.json`,
            JSON.stringify(instructorExport(definition), null, 2),
            'application/json',
          )
        }
      >
        Export JSON
      </Button>
    </details>
  );
}
