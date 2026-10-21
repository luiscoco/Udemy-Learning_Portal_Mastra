import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Button, Card } from '../components/ui/primitives';
import { safeReturnPath, useSession } from '../lib/auth-context';

export function LoginPage() {
  const auth = useSession();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get('next'));
  const [username, setUsername] = useState('learner');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (auth.session?.authenticated) return <Navigate to={next} replace />;
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Use a user name allowed by your local course server. The default is learner. This development login is available on this
        machine only.
      </p>
      {auth.status === 'loading' ? (
        <p role="status" className="mt-4">
          Checking your session…
        </p>
      ) : auth.status === 'error' ? (
        <div className="mt-4">
          <p role="alert">{auth.error}</p>
          <Button onClick={() => void auth.refresh()}>Retry session check</Button>
        </div>
      ) : (
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            void auth
              .signIn({ username, ...(password ? { password } : {}) })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
              })
              .finally(() => {
                setPassword('');
                setBusy(false);
              });
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            User name
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={64}
              pattern={'[a-zA-Z0-9._\\-]+'}
              value={username}
              disabled={busy}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 rounded-lg border border-border bg-bg px-3 text-fg"
            />
          </label>
          {auth.session?.login.passwordRequired ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Passcode
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-lg border border-border bg-bg px-3 text-fg"
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}
    </Card>
  );
}
