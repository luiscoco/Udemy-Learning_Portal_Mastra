import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { cn } from '../lib/cn';

// Last pathname that received heading focus. null until the initial page load has rendered.
// Query-only changes (e.g. ?tab=run) and StrictMode double effects never move focus.
let lastFocusedPath: string | null = null;

/** Page h1 that receives focus after client-side navigation to a new path (not on the initial load). */
export function PageHeading({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (lastFocusedPath === null) {
      lastFocusedPath = pathname;
      return;
    }
    if (pathname === lastFocusedPath) return;
    lastFocusedPath = pathname;
    ref.current?.focus();
  }, [pathname]);
  return (
    <h1 id={id} ref={ref} tabIndex={-1} className={cn('text-3xl font-semibold tracking-tight text-fg sm:text-4xl', className)}>
      {children}
    </h1>
  );
}
