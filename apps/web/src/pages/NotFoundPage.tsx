import { Link } from 'react-router';
import { PageHeading } from '../components/PageHeading';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  useDocumentTitle('Not found');
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <p className="font-mono text-sm text-fg-subtle">404</p>
      <PageHeading className="mt-2">We couldn’t find that {what}</PageHeading>
      <p className="mt-4 text-fg-muted">
        The link may be mistyped or the lab may not exist. Lab addresses look like <code className="font-mono">/labs/lab-07</code>.
        Use the search box (press <kbd className="rounded border border-border px-1 font-mono text-xs">/</kbd>) to find a lab.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-fg hover:bg-accent-hover"
      >
        Back to Home
      </Link>
    </div>
  );
}
