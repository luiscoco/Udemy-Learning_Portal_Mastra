import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import type { CatalogLab, LabDefinition } from '@mlp/contracts';
import { getLab, getModule } from '@mlp/lab-catalog';
import { fetchLabDefinition } from '../api/client';
import { PageHeading } from '../components/PageHeading';
import { LabWorkspace } from '../components/workspace/LabWorkspace';
import { Prerequisites } from '../components/Prerequisites';
import { Badge, Button, Notice, Skeleton } from '../components/ui/primitives';
import { useAsync } from '../lib/use-async';
import { useDocumentTitle } from '../lib/use-document-title';
import { NotFoundPage } from './NotFoundPage';

function LabHeader({ lab, children }: { lab: CatalogLab; children?: ReactNode }) {
  const mod = getModule(lab.moduleId);
  return (
    <header className="flex flex-col gap-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">
        {mod?.number === 0 ? 'Platform orientation' : `Module ${String(mod?.number ?? 0).padStart(2, '0')} · ${mod?.title ?? ''}`}
      </p>
      <PageHeading>
        <span className="font-mono text-fg-subtle">{lab.id}</span> {lab.title}
      </PageHeading>
      {children}
    </header>
  );
}

export function LabSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4" data-testid="lab-skeleton">
      <span className="sr-only">Loading lesson…</span>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-6 h-48 w-full" />
    </div>
  );
}

function LockedLab({ lab }: { lab: CatalogLab }) {
  return (
    <div className="flex flex-col gap-8">
      <LabHeader lab={lab}>
        <div className="flex flex-wrap gap-2">
          <Badge>Locked</Badge>
          {!lab.titleConfirmed ? <Badge tone="warning">Title pending</Badge> : null}
        </div>
      </LabHeader>
      <Notice tone="accent" title="This lab is not available yet" role="note">
        Its lesson, runnable exercise and quiz will appear here when the lab is released. Nothing is tracked for locked labs.
      </Notice>
      <section aria-labelledby="prereq-title">
        <h2 id="prereq-title" className="mb-3 text-lg font-semibold">
          Prerequisites
        </h2>
        <Prerequisites labIds={lab.prerequisites} />
      </section>
    </div>
  );
}

/** Available lab: header plus the Learn / Run / Source workspace. */
export function AvailableLab({ lab, definition }: { lab: CatalogLab; definition: LabDefinition }) {
  return (
    <div className="flex flex-col gap-8">
      <LabHeader lab={lab}>
        <p className="max-w-3xl text-lg text-fg-muted">{definition.summary}</p>
        <div className="flex flex-wrap gap-2">
          {definition.execution.modes.includes('offline') ? <Badge tone="accent">Offline mode · free</Badge> : null}
          {definition.execution.modes.includes('live') ? <Badge tone="warning">Live mode optional</Badge> : null}
        </div>
      </LabHeader>
      <LabWorkspace definition={definition} />
    </div>
  );
}

export function LabPage() {
  const { labId = '' } = useParams();
  const lab = getLab(labId);
  useDocumentTitle(lab ? `${lab.id} ${lab.title}` : 'Not found');
  if (!lab) return <NotFoundPage what="lab" />;
  if (lab.status === 'locked') return <LockedLab lab={lab} />;
  return <AvailableLabLoader lab={lab} />;
}

function AvailableLabLoader({ lab }: { lab: CatalogLab }) {
  const state = useAsync(lab.id, (signal) => fetchLabDefinition(lab.id, signal));
  if (state.status === 'loading') return <LabSkeleton />;
  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <LabHeader lab={lab} />
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
          <p className="font-semibold">Could not load this lesson</p>
          <p className="mt-1 text-sm">{state.error.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={state.retry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  return <AvailableLab lab={lab} definition={state.data} />;
}
