import { useState } from 'react';
import type { LabDefinition } from '@mlp/contracts';
import { useProgressActions } from '../../lib/progress-actions';
import { Prerequisites } from '../Prerequisites';
import { Badge, Button, Card } from '../ui/primitives';
import { Section } from './Section';

export function LearnTab({ definition }: { definition: LabDefinition }) {
  const { record, update } = useProgressActions(definition.id);
  const [hintsShown, setHintsShown] = useState(0);
  const prediction = record.prediction;
  const g = definition.guide;
  const id = (s: string) => `${definition.id}-learn-${s}`;

  return (
    <div className="flex flex-col gap-10">
      <Section title="Learning objectives" id={id('objectives')}>
        <ul className="list-disc space-y-1 pl-6 text-fg-muted">
          {definition.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </Section>

      <Section title="Prerequisites" id={id('prereq')}>
        <Prerequisites labIds={definition.prerequisites} />
      </Section>

      <Section title="Concept" id={id('concept')}>
        <p className="max-w-3xl text-base leading-7 text-fg">{definition.concept}</p>
      </Section>

      {g.diagram ? (
        <Section title="Diagram" id={id('diagram')}>
          <figure className="overflow-hidden rounded-xl border border-border">
            <pre className="overflow-x-auto bg-code-bg p-4 font-mono text-xs leading-5 text-code-fg" tabIndex={0}>
              {g.diagram.source}
            </pre>
            <figcaption className="border-t border-border bg-surface px-4 py-2 text-sm text-fg-muted">
              {g.diagram.caption}
              {g.diagram.kind === 'mermaid' ? ' (Mermaid source — paste into mermaid.live to render)' : ''}
            </figcaption>
          </figure>
        </Section>
      ) : null}

      <Section title="Procedure" id={id('procedure')}>
        <ol className="list-decimal space-y-2 pl-6 text-fg">
          {g.procedure.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="Predict before you run" id={id('prediction')}>
        <p className="text-fg-muted">{g.prediction}</p>
        <label htmlFor={id('prediction-input')} className="text-sm font-medium">
          Your prediction
        </label>
        <textarea
          id={id('prediction-input')}
          rows={3}
          maxLength={2000}
          value={prediction}
          onChange={(e) => update({ prediction: e.target.value })}
          className="w-full max-w-3xl rounded-lg border border-border-strong bg-surface p-3 text-sm"
        />
        <p className="text-xs text-fg-subtle">Saved automatically. Compare it with the Run tab result.</p>
      </Section>

      <Section title="Hints" id={id('hints')}>
        <ol className="flex flex-col gap-2" aria-live="polite">
          {g.hints.slice(0, hintsShown).map((h) => (
            <li key={h.level} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <Badge tone="accent" className="mr-2">
                Hint {h.level}
              </Badge>
              {h.text}
            </li>
          ))}
        </ol>
        {hintsShown < g.hints.length ? (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setHintsShown((n) => n + 1)}>
            Show hint {hintsShown + 1} of {g.hints.length}
          </Button>
        ) : (
          <p className="text-sm text-fg-subtle">All hints shown.</p>
        )}
      </Section>

      <Section title="Common mistakes" id={id('mistakes')}>
        <ul className="flex flex-col gap-2">
          {g.commonMistakes.map((m) => (
            <li key={m.mistake} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="font-medium text-danger">✗ {m.mistake}</p>
              <p className="mt-1 text-fg-muted">✓ {m.fix}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Challenge" id={id('challenge')}>
        <Card className="p-4">
          <p>{g.challenge.prompt}</p>
          <p className="mt-3 text-sm font-medium">You succeed when:</p>
          <ul className="mt-1 list-disc pl-6 text-sm text-fg-muted">
            {g.challenge.successCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
      </Section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        {record.lessonRead ? (
          <p className="text-sm font-medium text-success" role="status">
            ✓ Lesson marked as read
          </p>
        ) : (
          <Button onClick={() => update({ lessonRead: true })}>Mark lesson as read</Button>
        )}
        <p className="text-sm text-fg-muted">Next: open the Run tab and try the lab.</p>
      </div>
    </div>
  );
}
