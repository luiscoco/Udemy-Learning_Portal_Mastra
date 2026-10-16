import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { cn } from '../lib/cn';

// Location key of the initial page load; focus moves only on later navigations.
// Keyed (not a boolean) so StrictMode double effects do not count as a navigation.
let initialKey: string | null = null;

/** Page h1 that receives focus after client-side navigation (not on the initial load). */
export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (initialKey === null) initialKey = location.key;
    if (location.key === initialKey) return;
    ref.current?.focus();
  }, [location.key]);
  return (
    <h1 ref={ref} tabIndex={-1} className={cn('text-3xl font-semibold tracking-tight text-fg sm:text-4xl', className)}>
      {children}
    </h1>
  );
}
