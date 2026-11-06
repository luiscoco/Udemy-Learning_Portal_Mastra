import { useEffect, useState } from 'react';
import type { LabDefinition, LabSourceResponse } from '@mlp/contracts';
import { api } from '../../api/client';
import { CONCEPT_FLOWS, guideTranscript, teachingExcerpt, walkthroughPhases } from '../../features/visual-guides/content';
import { Badge, Button } from '../ui/primitives';
import { CodeBlock } from './CodeBlock';
import { FormattedResponse } from './FormattedResponse';
import { JsonView } from './RunTimeline';
import { PosterViewer } from './PosterViewer';
import { Section } from './Section';

export function VisualStudyTab({
  definition: d,
  kind,
  active,
  onNavigate,
}: {
  definition: LabDefinition;
  kind: 'infographic' | 'walkthrough';
  active: boolean;
  onNavigate: (tab: 'learn' | 'run' | 'source', anchor?: string) => void;
}) {
  const [source, setSource] = useState<LabSourceResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active || source) return;
    const ctrl = new AbortController();
    void api.labs
      .source(d.id, ctrl.signal)
      .then((value) => {
        if (!ctrl.signal.aborted) {
          setSource(value);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Reference excerpt unavailable');
      });
    return () => ctrl.abort();
  }, [active, d.id, attempt, source]);
  const excerpt = source ? teachingExcerpt(d, source.files) : null;
  const phases = walkthroughPhases(d);
  const current = phases[phase]!;
  const flow = CONCEPT_FLOWS[d.number] ?? CONCEPT_FLOWS[0]!;
  const title = kind === 'infographic' ? 'Infographic Content' : 'Exercise Walkthrough';
  return (
    <div className="visual-study flex min-w-0 flex-col gap-7">
      <Section title={title} id={`${d.id}-${kind}-title`}>
        <div className="flex flex-wrap gap-2">
          <Badge>
            {d.id} · {d.title}
          </Badge>
          <Badge tone="success">Offline viewing · free</Badge>
          <Badge>Teaching illustration</Badge>
        </div>
        <p className="text-sm text-fg-muted">
          {kind === 'infographic'
            ? 'Read the concept through a visual map and a checked reference-code excerpt.'
            : 'Follow six phases using this lesson’s actual inputs, checks and challenge. Choose exercise actions yourself.'}{' '}
          Reading or navigating does not run code or complete the lesson.
        </p>
        <PosterViewer
          definition={d}
          kind={kind}
          excerpt={excerpt}
          selected={phase}
          active={active}
          transcript={guideTranscript(d, kind, excerpt)}
        />
        {error ? (
          <div role="alert" className="text-sm text-danger">
            The checked code excerpt could not load: {error}{' '}
            <Button
              variant="secondary"
              onClick={() => {
                setError('');
                setAttempt((n) => n + 1);
              }}
            >
              Retry excerpt
            </Button>
            . The infographic and text summary remain available.
          </div>
        ) : null}
      </Section>
      {kind === 'walkthrough' ? (
        <Section title="Follow the exercise" id={`${d.id}-walkthrough-steps`}>
          <ol className="walkthrough-phases" aria-label="Exercise phases">
            {phases.map((item, i) => (
              <li key={item.title}>
                <button type="button" aria-current={phase === i ? 'step' : undefined} onClick={() => setPhase(i)}>
                  <span aria-hidden="true">{i + 1}.</span> {item.title}
                </button>
              </li>
            ))}
          </ol>
          <article className="walkthrough-current" aria-labelledby={`${d.id}-phase-heading`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Step {phase + 1} of 6 · learner-controlled practice
            </p>
            <h3 id={`${d.id}-phase-heading`} className="text-lg font-bold">
              {current.title}
            </h3>
            <FormattedResponse text={current.summary} />
            <ul className="list-disc space-y-2 pl-5 text-sm text-fg-muted">
              {current.details.map((detail, i) => (
                <li key={i}>
                  <FormattedResponse text={detail} />
                </li>
              ))}
            </ul>
            {phase === 2 ? (
              <div>
                <h4 className="mb-2 font-semibold">Actual example input</h4>
                <JsonView value={d.exampleInput} label={`${d.id} walkthrough example input`} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={phase === 0} onClick={() => setPhase((i) => i - 1)}>
                Previous step
              </Button>
              <Button variant="secondary" disabled={phase === 5} onClick={() => setPhase((i) => i + 1)}>
                Next step
              </Button>
              <Button
                onClick={() =>
                  onNavigate(
                    current.target === 'notes' ? 'learn' : current.target,
                    current.target === 'notes' ? `${d.id}-notes` : undefined,
                  )
                }
              >
                {current.target === 'notes'
                  ? 'Open My notes'
                  : `Open ${current.target === 'run' ? 'Run' : current.target === 'source' ? 'Source' : 'Learn'}`}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">
              Opening Run preserves its current input. You choose whether and when to run it. Live mode may incur charges.
            </p>
          </article>
        </Section>
      ) : null}
      <Section title="Read the infographic text" id={`${d.id}-${kind}-transcript`}>
        {kind === 'infographic' ? (
          <>
            <FormattedResponse text={d.concept} />
            <ol className="grid gap-4 sm:grid-cols-2">
              {flow.map((label, i) => (
                <li key={label} className="rounded-xl border border-border bg-surface-muted p-4">
                  <h3 className="font-bold">
                    {i + 1}. {label}
                  </h3>
                  <p className="mt-2 text-sm text-fg-muted">Related objective: {d.objectives[i % d.objectives.length]}</p>
                </li>
              ))}
            </ol>
            <h3 className="font-bold">Learning objectives</h3>
            <ul className="list-disc pl-5 text-sm">
              {d.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <h3 className="font-bold">Expected evidence</h3>
            <FormattedResponse text={d.expectedOutput.description} />
            <ul className="list-disc pl-5 text-sm">
              {d.checks.map((c) => (
                <li key={c.id}>{c.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <ol className="space-y-5">
            {phases.map((item, i) => (
              <li key={item.title}>
                <h3 className="mb-2 font-bold">
                  {i + 1}. {item.title}
                </h3>
                <FormattedResponse text={[item.summary, ...item.details.map((detail) => `- ${detail}`)].join('\n\n')} />
              </li>
            ))}
          </ol>
        )}
        {excerpt ? (
          <div className="min-w-0">
            <h3 className="mb-2 font-bold">Understand the code</h3>
            <p className="mb-3 text-sm text-fg-muted">
              Reference: packages/labs/src/{d.id}/{excerpt.path}:{excerpt.line}. Teaching excerpt; surrounding setup is omitted.
              Read the complete file in Source before adapting it.
            </p>
            <CodeBlock code={excerpt.code} language={excerpt.language} label={`${d.id} ${kind} teaching excerpt`} copyable />
            <Button className="mt-3" variant="secondary" onClick={() => onNavigate('source')}>
              Open complete source
            </Button>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            {source
              ? 'This lesson has no suitable non-solution code excerpt. Its complete reference remains in Source.'
              : error
                ? 'Reference code is unavailable until you retry.'
                : 'Select this tab to load its checked reference excerpt.'}
          </p>
        )}
      </Section>
    </div>
  );
}
