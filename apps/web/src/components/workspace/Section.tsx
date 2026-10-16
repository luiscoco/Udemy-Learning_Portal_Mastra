import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Section({
  title,
  id,
  children,
  className,
  actions,
}: {
  title: string;
  id: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold text-fg">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
