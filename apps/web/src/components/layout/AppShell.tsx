import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useTheme } from '../../lib/theme';
import { LogoMark, MenuIcon, MoonIcon, SunIcon } from '../ui/icons';
import { MobileDrawer } from './MobileDrawer';
import { SearchBox } from './SearchBox';
import { Sidebar } from './Sidebar';
import { SessionStatus } from './SessionStatus';

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      aria-pressed={theme === 'dark'}
      className="rounded-lg p-2.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

/** Legacy deep links: any route with ?lesson=lab-XX redirects to /labs/lab-XX. */
function useLegacyLessonRedirect(): string | null {
  const [params] = useSearchParams();
  const lesson = params.get('lesson');
  return lesson ? `/labs/${encodeURIComponent(lesson.trim().toLowerCase())}` : null;
}

export function AppShell({ children }: { children?: ReactNode }) {
  const redirect = useLegacyLessonRedirect();
  const location = useLocation();
  // The drawer remembers the path it was opened on, so any navigation closes it.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const menuOpen = menuOpenedAt === location.pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpenedAt(null), []);

  if (redirect) return <Navigate to={redirect} replace />;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            className="rounded-lg p-2.5 text-fg-muted hover:bg-surface-muted lg:hidden"
            aria-label="Open course menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-course-menu"
            onClick={() => setMenuOpenedAt(location.pathname)}
          >
            <MenuIcon />
          </button>
          <Link to="/" aria-label="Mastra Learning home" className="flex items-center gap-2 font-semibold text-fg">
            <LogoMark className="text-2xl" />
            <span className="hidden sm:inline">Mastra Learning</span>
          </Link>
          <div className="flex flex-1 justify-center px-2">
            <SearchBox />
          </div>
          <ThemeToggle />
          <SessionStatus />
        </div>
      </header>

      <MobileDrawer open={menuOpen} onClose={closeMenu} returnFocusRef={menuButtonRef}>
        <Sidebar onNavigate={closeMenu} />
      </MobileDrawer>

      <div className="mx-auto flex max-w-[90rem] gap-8 px-4 sm:px-6">
        <aside
          aria-label="Course navigation"
          className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-80 shrink-0 overflow-y-auto py-6 lg:block"
        >
          <Sidebar />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 py-8 lg:py-10">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
