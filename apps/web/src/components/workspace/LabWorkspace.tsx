import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { LabDefinition } from '@mlp/contracts';
import { useLabProgress } from '../../lib/progress-context';
import { useProgressActions } from '../../lib/progress-actions';
import { Badge } from '../ui/primitives';
import { InstructorPanel } from './InstructorPanel';
import { LearnTab } from './LearnTab';
import { QuizPanel } from './QuizPanel';
import { NotesPanel, SelfCheckPanel } from './ReflectPanels';
import { RunTab } from './RunTab';
import { SourceTab } from './SourceTab';
import { Tabs } from './Tabs';
import { NarratedTour } from '../narration/NarratedTour';
import { VisualStudyTab } from './VisualStudyTab';

const TAB_IDS = ['learn', 'run', 'source', 'infographic', 'walkthrough'] as const;
type TabId = (typeof TAB_IDS)[number];

function ProgressChecklist({ labId }: { labId: string }) {
  const p = useLabProgress(labId);
  const { reset } = useProgressActions(labId);
  const [confirmReset, setConfirmReset] = useState(false);
  const items = [
    { label: 'Lesson read', done: Boolean(p?.lessonRead) },
    { label: 'Run succeeded with passing checks', done: Boolean(p?.runSucceeded && p.checksPassed) },
    { label: 'Quiz passed', done: Boolean(p?.quiz?.passed) },
  ];
  return (
    <section aria-label="Lab progress" className="lesson-progress flex flex-wrap items-center gap-3">
      {p?.status === 'completed' ? (
        <Badge tone="success" data-testid="lab-status">
          Completed
        </Badge>
      ) : (
        <Badge tone={p?.status === 'in-progress' ? 'warning' : 'neutral'} data-testid="lab-status">
          {p?.status === 'in-progress' ? 'In progress' : 'Not started'}
        </Badge>
      )}
      {items.map((i) => (
        <span key={i.label} className={`text-xs ${i.done ? 'text-success' : 'text-fg-subtle'}`}>
          {i.done ? '✓' : '○'} {i.label}
        </span>
      ))}
      {confirmReset ? (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          Reset this lab, including notes and quiz answers?
          <button
            type="button"
            className="underline"
            onClick={() => {
              reset();
              setConfirmReset(false);
            }}
          >
            Confirm reset
          </button>
          <button type="button" className="underline" onClick={() => setConfirmReset(false)}>
            Keep progress
          </button>
        </span>
      ) : (
        <button type="button" className="text-xs underline" onClick={() => setConfirmReset(true)}>
          Reset this lab’s progress
        </button>
      )}
    </section>
  );
}

/** Learn / Run / Source workspace for an available lab, plus quiz, self-check, notes and instructor assets. */
export function LabWorkspace({ definition }: { definition: LabDefinition }) {
  const progress = useLabProgress(definition.id);
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const selected: TabId = TAB_IDS.includes(raw as TabId) ? (raw as TabId) : 'learn';
  const select = (id: TabId) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === 'learn') next.delete('tab');
        else next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  const navigate = (tab: 'learn' | 'run' | 'source', anchor?: string) => {
    select(tab);
    requestAnimationFrame(() => {
      const target = document.getElementById(anchor ?? `${definition.id}-tab-${tab}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'center' });
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <ProgressChecklist labId={definition.id} />
      <Tabs<TabId>
        label="Lesson sections"
        idPrefix={definition.id}
        selected={selected}
        onSelect={select}
        tabs={[
          { id: 'learn', label: 'Learn', panel: <LearnTab definition={definition} /> },
          {
            id: 'run',
            label: 'Run',
            panel: (
              <div className="flex flex-col gap-6">
                {selected === 'run' ? <NarratedTour definition={definition} kind="exercise" /> : null}
                <RunTab definition={definition} />
              </div>
            ),
          },
          { id: 'source', label: 'Source', panel: <SourceTab definition={definition} isActive={selected === 'source'} /> },
          {
            id: 'infographic',
            label: 'Infographic Content',
            panel: (
              <VisualStudyTab
                definition={definition}
                kind="infographic"
                active={selected === 'infographic'}
                onNavigate={navigate}
              />
            ),
          },
          {
            id: 'walkthrough',
            label: 'Exercise Walkthrough',
            panel: (
              <VisualStudyTab
                definition={definition}
                kind="walkthrough"
                active={selected === 'walkthrough'}
                onNavigate={navigate}
              />
            ),
          },
        ]}
      />
      <div className="lesson-review grid gap-8 [&>*]:min-w-0">
        <QuizPanel key={JSON.stringify(progress?.quiz ?? null)} definition={definition} />
        <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
          <SelfCheckPanel definition={definition} />
          <NotesPanel definition={definition} />
        </div>
        <InstructorPanel definition={definition} />
      </div>
    </div>
  );
}
