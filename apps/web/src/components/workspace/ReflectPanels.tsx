import { useEffect, useRef, useState } from 'react';
import type { LabDefinition } from '@mlp/contracts';
import { useProgressActions } from '../../lib/progress-actions';
import { Section } from './Section';

export const NOTES_MAX = 10_000;

export function SelfCheckPanel({ definition }: { definition: LabDefinition }) {
  const { record, update } = useProgressActions(definition.id);
  return (
    <Section title="Self-check" id={`${definition.id}-selfcheck`}>
      <p className="text-sm text-fg-muted">Tick each objective you can do without looking at the lesson.</p>
      <ul className="flex flex-col gap-1.5">
        {definition.objectives.map((o, i) => {
          const key = `objective-${i + 1}`;
          return (
            <li key={key}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(record.selfCheck[key])}
                  onChange={(e) => update((cur) => ({ selfCheck: { ...cur.selfCheck, [key]: e.target.checked } }))}
                />
                I can: {o}
              </label>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function NotesPanel({ definition }: { definition: LabDefinition }) {
  const { record, update } = useProgressActions(definition.id);
  const [text, setText] = useState(record.notes);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const id = `${definition.id}-notes`;

  // Flush an unsaved edit when the panel unmounts (navigation away) instead of dropping it.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) update({ notes: pending.current });
    },
    [update],
  );

  return (
    <Section title="My notes" id={`${id}-title`}>
      <label htmlFor={id} className="sr-only">
        Notes for {definition.id}
      </label>
      <textarea
        id={id}
        rows={6}
        maxLength={NOTES_MAX}
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          setSaved(false);
          pending.current = value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            update({ notes: value });
            pending.current = null;
            setSaved(true);
          }, 500);
        }}
        className="w-full rounded-lg border border-border-strong bg-surface p-3 text-sm"
        placeholder="What surprised you? What will you try in your own project?"
      />
      <p className="text-xs text-fg-subtle" role="status" data-testid="notes-status">
        {saved ? 'Saved' : 'Saving…'} · {text.length.toLocaleString()} / {NOTES_MAX.toLocaleString()} characters
      </p>
    </Section>
  );
}
