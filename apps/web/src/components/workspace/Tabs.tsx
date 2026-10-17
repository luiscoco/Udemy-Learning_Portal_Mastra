import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  panel: ReactNode;
}

/** WAI-ARIA tabs with automatic activation. Panels stay mounted (hidden) so running work survives tab switches. */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  idPrefix,
}: {
  label: string;
  tabs: TabDef<T>[];
  selected: T;
  onSelect: (id: T) => void;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === selected);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === -1) return;
    e.preventDefault();
    onSelect(tabs[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-border">
        {tabs.map((t, i) => {
          const isSel = t.id === selected;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${t.id}`}
              aria-selected={isSel}
              aria-controls={`${idPrefix}-panel-${t.id}`}
              tabIndex={isSel ? 0 : -1}
              onClick={() => onSelect(t.id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium',
                isSel ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${t.id}`}
          aria-labelledby={`${idPrefix}-tab-${t.id}`}
          hidden={t.id !== selected}
          tabIndex={0}
          className="pt-6"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
