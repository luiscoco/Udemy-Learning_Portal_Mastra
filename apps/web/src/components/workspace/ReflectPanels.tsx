import type { LabDefinition } from '@mlp/contracts';
import { useProgressActions } from '../../lib/progress-actions';
import { useProgressStore } from '../../lib/progress-context';
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
  const store = useProgressStore();
  const sync = store.getSyncState?.();
  const text = record.notes;
  const id = `${definition.id}-notes`;

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
        onChange={(e) => update({ notes: e.target.value })}
        className="w-full rounded-lg border border-border-strong bg-surface p-3 text-sm"
        placeholder="What surprised you? What will you try in your own project?"
      />
      <p className="text-xs text-fg-subtle" role="status" data-testid="notes-status">
        {sync?.localDurable === false
          ? 'Keep this tab open'
          : sync?.phase === 'saved'
            ? 'Saved to account'
            : 'Saved on this device'}{' '}
        · {text.length.toLocaleString()} / {NOTES_MAX.toLocaleString()} characters
      </p>
    </Section>
  );
}
