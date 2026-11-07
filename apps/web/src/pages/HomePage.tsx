import { Link } from 'react-router';
import { catalog, labsInModule } from '@mlp/lab-catalog';
import { HealthStatus } from '../components/HealthStatus';
import { displayStatus, LabStatusIcon, STATUS_LABEL } from '../components/LabStatusIcon';
import { PageHeading } from '../components/PageHeading';
import { CourseProgressSummary } from '../components/layout/Sidebar';
import { Badge, Card } from '../components/ui/primitives';
import { LogoMark } from '../components/ui/icons';
import { cn } from '../lib/cn';
import { useAllProgress } from '../lib/progress-context';
import { useDocumentTitle } from '../lib/use-document-title';

export function HomePage() {
  useDocumentTitle('');
  const progress = useAllProgress();
  const nextLab =
    catalog.labs.find((l) => l.status === 'available' && progress[l.id]?.status !== 'completed') ??
    catalog.labs.find((l) => l.status === 'available');

  return (
    <div className="flex flex-col gap-10">
      <section
        aria-labelledby="home-title"
        className="portal-hero rounded-3xl border border-border bg-surface px-6 py-10 sm:px-10"
      >
        <div className="hero-mark mb-6" aria-hidden="true">
          <LogoMark />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Mastra AI Agents 2026</p>
        <PageHeading id="home-title" className="mt-2 max-w-3xl">
          Build production AI agents with Mastra, one lab at a time
        </PageHeading>
        <p className="mt-4 max-w-2xl text-lg text-fg-muted">
          Fifteen modules and 75 hands-on labs. Every lab runs on the server with a free offline mode, streams its events live,
          and checks your result automatically.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {nextLab ? (
            <Link
              to={`/labs/${nextLab.id}`}
              className="inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              {progress[nextLab.id] ? 'Continue' : 'Start'} {nextLab.title}
            </Link>
          ) : null}
          <Link
            to="/projects"
            className="inline-flex h-11 items-center rounded-lg border border-border-strong px-5 font-medium text-fg hover:bg-surface-muted"
          >
            Milestone projects
          </Link>
          <a
            href="#course-map"
            className="inline-flex h-11 items-center rounded-lg border border-border-strong px-5 font-medium text-fg hover:bg-surface-muted"
          >
            Browse the course map
          </a>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <CourseProgressSummary />
        <Card className="paper-surface platform-card p-5">
          <h2 className="mb-3 text-sm font-medium">Platform status</h2>
          <HealthStatus />
        </Card>
      </div>

      <section id="course-map" aria-labelledby="course-map-title" className="scroll-mt-24">
        <h2 id="course-map-title" className="text-2xl font-semibold tracking-tight">
          Course map
        </h2>
        <p className="mt-1 text-fg-muted">Locked labs are previews: they open when their implementation is released.</p>
        <ol className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {catalog.modules.map((mod) => {
            const labs = labsInModule(mod.id);
            const available = labs.filter((l) => l.status === 'available').length;
            return (
              <li key={mod.id}>
                <Card className={cn('paper-surface module-card h-full p-5', `module-tone-${mod.number % 3}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        {mod.number === 0 ? 'Start here' : `Module ${String(mod.number).padStart(2, '0')}`}
                      </p>
                      <h3 className={cn('mt-1 font-semibold', !mod.titleConfirmed && 'italic text-fg-muted')}>{mod.title}</h3>
                    </div>
                    {available > 0 ? <Badge tone="success">{available} available</Badge> : <Badge>Locked</Badge>}
                  </div>
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {labs.map((lab) => {
                      const status = displayStatus(lab, progress[lab.id]?.status);
                      return (
                        <li key={lab.id}>
                          <Link
                            to={`/labs/${lab.id}`}
                            className="flex items-start gap-2 rounded-md px-1 py-0.5 text-sm text-fg-muted hover:text-accent"
                          >
                            <LabStatusIcon status={status} className="mt-1 shrink-0" />
                            <span className={cn(!lab.titleConfirmed && 'italic')}>
                              <span className="font-mono text-xs">{String(lab.number).padStart(2, '0')}</span> {lab.title}
                              <span className="sr-only"> ({STATUS_LABEL[status]})</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
