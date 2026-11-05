import { useLayoutEffect } from 'react';
import { useSession } from './auth-context';
import { useProgressStore } from './progress-context';
import { storageScopeOf } from './storage-scope';

/** Points the progress store at the signed-in learner's scope (guest when signed out). Renders nothing. */
export function ProgressScopeSync() {
  const store = useProgressStore();
  const { session } = useSession();
  const scope = storageScopeOf(session?.authenticated ? session.principal : null);
  const subject = session?.authenticated ? session.principal!.sub : null;
  useLayoutEffect(() => {
    if (store.setIdentity) store.setIdentity(subject);
    else store.setScope?.(scope);
  }, [store, scope, subject]);
  return null;
}

/** The browser-storage scope of the current learner. */
export function useStorageScope(): string {
  const { session } = useSession();
  return storageScopeOf(session?.authenticated ? session.principal : null);
}
