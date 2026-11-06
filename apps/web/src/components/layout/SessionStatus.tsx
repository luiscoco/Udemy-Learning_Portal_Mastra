import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useSession } from '../../lib/auth-context';
import { Button } from '../ui/primitives';

export function SessionStatus() {
  const auth = useSession();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs">
      {auth.session?.authenticated && auth.session.login.autoLocal ? (
        <span>Local learner: {auth.session.principal?.name}</span>
      ) : auth.session?.authenticated ? (
        <>
          <span className="sr-only sm:not-sr-only">Signed in as {auth.session.principal?.name}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void auth
                .signOut()
                .catch(() => setError('Sign-out failed. Try again.'))
                .finally(() => setBusy(false));
            }}
          >
            Sign out
          </Button>
        </>
      ) : (
        <Link
          className="rounded-lg px-2 py-2 font-medium text-accent"
          to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        >
          Sign in
        </Link>
      )}
      {error ? (
        <span role="alert" className="max-w-32 text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
