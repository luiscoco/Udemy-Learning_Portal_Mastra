import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { catalog, getModule } from '@mlp/lab-catalog';
import type { CatalogLab } from '@mlp/contracts';
import { cn } from '../../lib/cn';
import { SearchIcon } from '../ui/icons';
import { Badge } from '../ui/primitives';

export function searchLabs(query: string, limit = 8): CatalogLab[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  // Rank: id/number match > title match > module-title-only match; then available first, then course order.
  const scored = catalog.labs.flatMap((lab) => {
    const own = `${lab.id} ${lab.number} ${lab.title}`.toLowerCase();
    const hay = `${own} ${getModule(lab.moduleId)?.title ?? ''}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return [];
    const score = lab.id === q || String(lab.number) === q ? 3 : terms.every((t) => own.includes(t)) ? 2 : 1;
    return [{ lab, score }];
  });
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.lab.status === b.lab.status ? 0 : a.lab.status === 'available' ? -1 : 1) ||
        a.lab.number - b.lab.number,
    )
    .map((s) => s.lab)
    .slice(0, limit);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** WAI-ARIA combobox for finding labs. Press "/" anywhere to focus it. */
export function SearchBox() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchLabs(query), [query]);
  const expanded = open && query.trim().length > 0;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (lab: CatalogLab) => {
    setQuery('');
    setOpen(false);
    navigate(`/labs/${lab.id}`);
  };

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search labs
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && results[active] ? `${listId}-${results[active].id}` : undefined}
        placeholder="Search labs  ( / )"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            const lab = results[active];
            if (lab) {
              e.preventDefault();
              go(lab);
            }
          } else if (e.key === 'Escape') {
            if (query) setQuery('');
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching labs"
        hidden={!expanded}
        className="absolute z-30 mt-1 max-h-96 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
      >
        {results.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-sm text-fg-muted">
            No labs match “{query}”
          </li>
        ) : (
          results.map((lab, i) => (
            <li
              key={lab.id}
              id={`${listId}-${lab.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(lab);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                i === active ? 'bg-accent-soft text-accent' : 'text-fg',
              )}
            >
              <span>
                <span className="font-mono text-xs text-fg-subtle">{lab.id}</span> {lab.title}
              </span>
              {lab.status === 'locked' ? <Badge>Locked</Badge> : <Badge tone="success">Available</Badge>}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
