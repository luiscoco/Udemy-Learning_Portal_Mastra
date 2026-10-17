import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import { catalog, labsInModule } from '@mlp/lab-catalog';
import { useAllProgress, useCourseProgress } from '../../lib/progress-context';
import { cn } from '../../lib/cn';
import { displayStatus, LabStatusIcon, STATUS_LABEL } from '../LabStatusIcon';
import { ChevronIcon, HomeIcon } from '../ui/icons';
import { ProgressBar } from '../ui/primitives';

const STORAGE_KEY = 'mlp.sidebar.v1';

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
  } catch {
    // ignore
  }
  return { 'module-00': true, 'module-01': true };
}

/** Moves focus between sidebar items with arrow keys, Home and End. */
function onRovingKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-item]')).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  const idx = items.indexOf(document.activeElement as HTMLElement);
  if (idx === -1) return;
  e.preventDefault();
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : e.key === 'ArrowDown'
          ? Math.min(idx + 1, items.length - 1)
          : Math.max(idx - 1, 0);
  items[next]?.focus();
}

export function CourseProgressSummary() {
  const p = useCourseProgress();
  return (
    <section aria-label="Course progress" className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium text-fg">Course progress</p>
      <p className="mt-1 text-xs text-fg-muted" data-testid="progress-summary">
        {p.completedLabs} of {p.availableLabs} available {p.availableLabs === 1 ? 'lab' : 'labs'} completed
      </p>
      <div className="mt-3">
        <ProgressBar value={p.completedLabs} max={p.availableLabs} label="Completed available labs" />
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        {p.availableLabs} of {p.totalLabs} labs released
      </p>
    </section>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { labId: activeLabId } = useParams();
  const progress = useAllProgress();
  const activeModule = catalog.labs.find((l) => l.id === activeLabId)?.moduleId;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    ...loadExpanded(),
    ...(activeModule ? { [activeModule]: true } : {}),
  }));

  // When navigation opens a lab in another module, expand that module (state adjusted during render).
  const [lastActiveModule, setLastActiveModule] = useState(activeModule);
  if (activeModule !== lastActiveModule) {
    setLastActiveModule(activeModule);
    if (activeModule && !expanded[activeModule]) setExpanded((s) => ({ ...s, [activeModule]: true }));
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
    } catch {
      // ignore
    }
  }, [expanded]);

  const toggle = useCallback((id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] })), []);

  return (
    <nav aria-label="Course" className="flex flex-col gap-4" onKeyDown={onRovingKeyDown}>
      <Link
        to="/"
        data-nav-item
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg hover:bg-surface-muted"
      >
        <HomeIcon className="text-fg-muted" /> Home
      </Link>

      <CourseProgressSummary />

      <ul className="flex flex-col gap-1" aria-label="Modules">
        {catalog.modules.map((mod) => {
          const isOpen = Boolean(expanded[mod.id]);
          const labs = labsInModule(mod.id);
          const available = labs.filter((l) => l.status === 'available').length;
          const listId = `sidebar-${mod.id}`;
          return (
            <li key={mod.id}>
              <button
                type="button"
                data-nav-item
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => toggle(mod.id)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <ChevronIcon className={cn('mt-1 shrink-0 text-fg-subtle transition-transform', isOpen && 'rotate-90')} />
                <span className="flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {mod.number === 0 ? 'Start here' : `Module ${String(mod.number).padStart(2, '0')}`}
                  </span>
                  <span className={cn('block font-medium text-fg', !mod.titleConfirmed && 'italic text-fg-muted')}>
                    {mod.title}
                  </span>
                  <span className="sr-only">
                    , {available} of {labs.length} labs available
                  </span>
                </span>
              </button>
              <ul id={listId} hidden={!isOpen} className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-2">
                {labs.map((lab) => {
                  const status = displayStatus(lab, progress[lab.id]?.status);
                  return (
                    <li key={lab.id}>
                      <NavLink
                        to={`/labs/${lab.id}`}
                        data-nav-item
                        onClick={onNavigate}
                        aria-label={`${lab.id}: ${lab.title} (${STATUS_LABEL[status]})`}
                        className={({ isActive }) =>
                          cn(
                            'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm',
                            isActive
                              ? 'bg-accent-soft font-medium text-accent'
                              : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                            lab.status === 'locked' && !isActive && 'text-fg-subtle',
                          )
                        }
                      >
                        <LabStatusIcon
                          status={status}
                          className={cn('mt-1 shrink-0', status === 'completed' ? 'text-success' : 'text-fg-subtle')}
                        />
                        <span className={cn(!lab.titleConfirmed && 'italic')}>
                          <span className="font-mono text-xs">{String(lab.number).padStart(2, '0')}</span> {lab.title}
                        </span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
