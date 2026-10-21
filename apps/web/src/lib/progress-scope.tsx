import { useEffect } from 'react';
import { useSession } from './auth-context';
import { useProgressStore } from './progress-context';
import { storageScopeOf } from './storage-scope';

/** Points the progress store at the signed-in learner's scope (guest when signed out). Renders nothing. */
export function ProgressScopeSync() {
  const store = useProgressStore();
  const { session } = useSession();
  const scope = storageScopeOf(session?.authenticated ? session.principal : null);
  useEffect(() => store.setScope?.(scope), [store, scope]);
  return null;
}

/** The browser-storage scope of the current learner. */
export function useStorageScope(): string {
  const { session } = useSession();
  return storageScopeOf(session?.authenticated ? session.principal : null);
}
